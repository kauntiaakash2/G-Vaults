import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, DocumentPermission, Prisma, RecordStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CustodyService } from './custody.service';
import { DocumentAuthorizationService } from './document-authorization.service';
import { ChangeRecordStatusDto, PlaceLegalHoldDto, ReleaseLegalHoldDto } from './dto/records.dto';

const transitions: Record<RecordStatus, RecordStatus[]> = {
  DRAFT: [RecordStatus.FINAL],
  FINAL: [RecordStatus.DRAFT, RecordStatus.DECLARED_RECORD],
  DECLARED_RECORD: [RecordStatus.ARCHIVED, RecordStatus.DISPOSITION_DUE],
  ARCHIVED: [RecordStatus.DISPOSITION_DUE],
  DISPOSITION_DUE: [RecordStatus.ARCHIVED, RecordStatus.DISPOSED],
  DISPOSED: [],
};

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: DocumentAuthorizationService,
    private readonly audit: AuditService,
    private readonly custody: CustodyService,
  ) {}

  async provenance(documentId: string, user: AuthenticatedUser) {
    await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    return this.prisma.custodyEvent.findMany({
      where: { documentId },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        version: { select: { id: true, versionNumber: true, versionKind: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async holds(documentId: string, user: AuthenticatedUser) {
    await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    return this.prisma.legalHold.findMany({
      where: { documentId },
      include: {
        placedBy: { select: { id: true, name: true } },
        releasedBy: { select: { id: true, name: true } },
      },
      orderBy: { placedAt: 'desc' },
    });
  }

  async placeHold(documentId: string, dto: PlaceLegalHoldDto, user: AuthenticatedUser) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.APPROVE);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.document.updateMany({
          where: { id: documentId, revision: dto.expectedRevision },
          data: { revision: { increment: 1 } },
        });
        if (claimed.count !== 1) throw this.staleDocument();
        const hold = await tx.legalHold.create({
          data: {
            caseId: document.caseId,
            documentId,
            reason: dto.reason.trim(),
            reference: dto.reference?.trim(),
            placedById: user.id,
          },
        });
        await this.custody.append({
          category: 'RECORD_LIFECYCLE', type: 'HOLD_PLACED', caseId: document.caseId,
          documentId, actorId: user.id, details: { holdId: hold.id, reason: dto.reason },
        }, tx);
        await this.audit.append({
          userId: user.id, action: 'LEGAL_HOLD_PLACED', entityType: 'legal_hold', entityId: hold.id,
          caseId: document.caseId, documentId, metadata: { reason: dto.reason, reference: dto.reference ?? null },
        }, tx);
        return hold;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An active legal hold already protects this document');
      }
      throw error;
    }
  }

  async releaseHold(documentId: string, holdId: string, dto: ReleaseLegalHoldDto, user: AuthenticatedUser) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.APPROVE);
    const hold = await this.prisma.legalHold.findFirst({ where: { id: holdId, documentId } });
    if (!hold) throw new NotFoundException('Legal hold not found');

    return this.prisma.$transaction(async (tx) => {
      const claimedDocument = await tx.document.updateMany({
        where: { id: documentId, revision: dto.expectedDocumentRevision },
        data: { revision: { increment: 1 } },
      });
      if (claimedDocument.count !== 1) throw this.staleDocument();
      const releasedHold = await tx.legalHold.updateMany({
        where: { id: holdId, documentId, status: 'ACTIVE', revision: dto.expectedHoldRevision },
        data: {
          status: 'RELEASED', releasedById: user.id, releasedAt: new Date(),
          releaseReason: dto.reason.trim(), revision: { increment: 1 },
        },
      });
      if (releasedHold.count !== 1) {
        throw new ConflictException('Legal hold changed since it was loaded; refresh and retry');
      }
      await this.custody.append({
        category: 'RECORD_LIFECYCLE', type: 'HOLD_RELEASED', caseId: document.caseId,
        documentId, actorId: user.id, details: { holdId, reason: dto.reason },
      }, tx);
      await this.audit.append({
        userId: user.id, action: 'LEGAL_HOLD_RELEASED', entityType: 'legal_hold', entityId: holdId,
        caseId: document.caseId, documentId, metadata: { reason: dto.reason },
      }, tx);
      return tx.legalHold.findUniqueOrThrow({ where: { id: holdId } });
    });
  }

  async changeStatus(documentId: string, dto: ChangeRecordStatusDto, user: AuthenticatedUser) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.APPROVE);
    const current = document.recordStatus;
    if (current === dto.status) throw new BadRequestException('Document already has this record status');
    if (!transitions[current].includes(dto.status)) {
      throw new ConflictException(`Record status cannot transition from ${current} to ${dto.status}`);
    }

    if (dto.status === RecordStatus.DISPOSED) {
      const activeHold = await this.prisma.legalHold.findFirst({ where: { documentId, status: 'ACTIVE' } });
      if (activeHold) {
        await this.custody.append({
          category: 'RECORD_LIFECYCLE', type: 'DISPOSITION_BLOCKED', caseId: document.caseId,
          documentId, actorId: user.id, details: { holdId: activeHold.id, requestedStatus: dto.status },
        });
        await this.audit.append({
          userId: user.id, action: 'RECORD_DISPOSITION_BLOCKED', entityType: 'document', entityId: documentId,
          caseId: document.caseId, documentId, result: AuditResult.DENIED,
          metadata: { holdId: activeHold.id, reason: dto.reason },
        });
        throw new ConflictException('Active legal hold prevents disposition');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.document.updateMany({
        where: { id: documentId, revision: dto.expectedRevision },
        data: { recordStatus: dto.status, revision: { increment: 1 } },
      });
      if (claimed.count !== 1) throw this.staleDocument();
      await this.custody.append({
        category: 'RECORD_LIFECYCLE', type: 'RECORD_STATUS_CHANGED', caseId: document.caseId,
        documentId, actorId: user.id, details: { from: current, to: dto.status, reason: dto.reason },
      }, tx);
      await this.audit.append({
        userId: user.id, action: 'RECORD_STATUS_CHANGED', entityType: 'document', entityId: documentId,
        caseId: document.caseId, documentId, metadata: { from: current, to: dto.status, reason: dto.reason },
      }, tx);
      return tx.document.findUniqueOrThrow({ where: { id: documentId } });
    });
  }

  private staleDocument() {
    return new ConflictException('Document changed since it was loaded; refresh and retry');
  }
}
