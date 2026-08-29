import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentPermission, Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { DocumentAuthorizationService } from './document-authorization.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrClientService } from './ocr-client.service';

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly encryption: EncryptionService,
    private readonly authorization: DocumentAuthorizationService,
    private readonly audit: AuditService,
    private readonly ocrClient: OcrClientService,
  ) {}

  async status(documentId: string, user: AuthenticatedUser, requestedVersionId?: string) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    const versionId = requestedVersionId ?? document.currentVersionId;
    const version = versionId
      ? await this.prisma.documentVersion.findFirst({ where: { id: versionId, documentId }, include: { ocrResult: true, aiSummary: true } })
      : null;
    const jobs = await this.prisma.processingJob.findMany({ where: { documentVersionId: version?.id }, orderBy: { createdAt: 'desc' } });
    return { versionId: version?.id ?? null, ocr: version?.ocrResult ?? null, summary: version?.aiSummary ?? null, jobs };
  }

  async processVersion(versionId: string) {
    const version = await this.prisma.documentVersion.findUnique({ where: { id: versionId }, include: { document: true } });
    if (!version) throw new NotFoundException('Document version not found');
    const job = await this.prisma.processingJob.findFirst({ where: { documentVersionId: versionId, type: 'OCR', status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
    if (!job) return this.statusForVersion(versionId);
    await this.prisma.processingJob.update({ where: { id: job.id }, data: { status: 'PROCESSING', attempts: { increment: 1 }, startedAt: new Date() } });
    await this.audit.append({ action: 'OCR_STARTED', entityType: 'document_version', entityId: versionId, caseId: version.document.caseId, documentId: version.documentId, versionId });
    try {
      const encrypted = await this.storage.get(version.storageKey);
      const bytes = this.encryption.decrypt(encrypted, version.storageKey);
      const workerResult = this.ocrClient.configured() ? await this.ocrClient.process(versionId, version.mimeType, bytes) : null;
      const extracted = workerResult
        ? { text: workerResult.text, pageCount: workerResult.page_count, engine: workerResult.engine }
        : this.extract(bytes, version.mimeType);
      const result = await this.prisma.ocrResult.upsert({
        where: { documentVersionId: versionId },
        create: { documentVersionId: versionId, status: extracted.engine === 'OCR_REQUIRED' ? 'PENDING_OCR' : 'COMPLETED', text: extracted.text, pageCount: extracted.pageCount, engine: extracted.engine },
        update: { status: extracted.engine === 'OCR_REQUIRED' ? 'PENDING_OCR' : 'COMPLETED', text: extracted.text, pageCount: extracted.pageCount, engine: extracted.engine },
      });
      if (extracted.text) {
        await this.prisma.aiSummary.upsert({
          where: { documentVersionId: versionId },
          create: { documentVersionId: versionId, summary: extracted.text.slice(0, 600), model: 'extractive-prototype' },
          update: { summary: extracted.text.slice(0, 600), model: 'extractive-prototype' },
        });
      }
      await this.prisma.processingJob.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: new Date(), error: null } });
      await this.audit.append({ action: 'OCR_COMPLETED', entityType: 'document_version', entityId: versionId, caseId: version.document.caseId, documentId: version.documentId, versionId, metadata: { engine: extracted.engine, pageCount: extracted.pageCount } });
      return result;
    } catch (error) {
      await this.prisma.processingJob.update({ where: { id: job.id }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 500) : 'Processing failed', completedAt: new Date() } });
      throw error;
    }
  }

  async run(documentId: string, user: AuthenticatedUser, requestedVersionId?: string) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.EDIT);
    const versionId = requestedVersionId ?? document.currentVersionId;
    if (versionId) {
      const existing = await this.prisma.ocrResult.findUnique({ where: { documentVersionId: versionId } });
      // Older builds could persist the PDF container itself as "extracted" text.
      // Remove that invalid result before allowing a clean retry through the OCR worker.
      if (existing?.text.trimStart().startsWith('%PDF-')) {
        await this.prisma.$transaction([
          this.prisma.aiSummary.deleteMany({ where: { documentVersionId: versionId } }),
          this.prisma.ocrResult.delete({ where: { documentVersionId: versionId } }),
        ]);
      }
      const pending = await this.prisma.processingJob.findFirst({ where: { documentVersionId: versionId, type: 'OCR', status: 'PENDING' } });
      if (!pending) await this.prisma.processingJob.create({ data: { documentVersionId: versionId, type: 'OCR' } });
      await this.processVersion(versionId);
    }
    await this.audit.append({ userId: user.id, action: 'OCR_PROCESSING_REQUESTED', entityType: 'document', entityId: documentId, caseId: document.caseId, documentId, versionId });
    return this.status(documentId, user, versionId ?? undefined);
  }

  private async statusForVersion(versionId: string) {
    return this.prisma.ocrResult.findUnique({ where: { documentVersionId: versionId } });
  }

  private extract(bytes: Buffer, mimeType: string) {
    if (mimeType === 'text/plain' || mimeType === 'text/markdown') {
      // eslint-disable-next-line no-control-regex
      return { text: bytes.toString('utf8').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim(), pageCount: 1, engine: 'TEXT_EXTRACTOR' };
    }
    if (mimeType === 'application/pdf') {
      return { text: '', pageCount: 1, engine: 'OCR_REQUIRED' };
    }
    return { text: '', pageCount: 1, engine: 'OCR_REQUIRED' };
  }
}

export type SearchFilters = { q: string; caseId?: string; departmentId?: string; documentType?: string; createdFrom?: Date; createdTo?: Date };

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async search(filters: SearchFilters, user: AuthenticatedUser) {
    const q = filters.q.trim();
    const principal = [{ userId: user.id }, ...(user.departmentId ? [{ departmentId: user.departmentId }] : [])];
    const scope: Prisma.DocumentWhereInput = user.role === 'ADMIN' || user.role === 'AUDITOR'
      ? {}
      : { OR: [{ createdById: user.id }, { permissions: { some: { status: 'ACTIVE', OR: principal } } }] };
    const ocrTextFilter = { contains: q, mode: Prisma.QueryMode.insensitive };
    const queryFilter: Prisma.DocumentWhereInput = q ? {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { case: { caseNumber: { contains: q, mode: 'insensitive' } } },
        { versions: { some: { ocrResult: { text: ocrTextFilter } } } },
      ],
    } : {};
    const records = await this.prisma.document.findMany({
      where: { AND: [scope, queryFilter], ...(filters.caseId ? { caseId: filters.caseId } : {}), ...(filters.departmentId ? { ownerDepartmentId: filters.departmentId } : {}), ...(filters.documentType ? { documentType: filters.documentType.toUpperCase() } : {}), ...((filters.createdFrom || filters.createdTo) ? { createdAt: { gte: filters.createdFrom, lte: filters.createdTo } } : {}) },
      include: {
        case: { select: { id: true, caseNumber: true, title: true } },
        currentVersion: { include: { ocrResult: true } },
        versions: {
          where: { ocrResult: { text: ocrTextFilter } },
          include: { ocrResult: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    await this.audit.append({ userId: user.id, action: 'DOCUMENT_SEARCHED', entityType: 'search', entityId: 'search', metadata: { queryLength: q.length, resultCount: records.length } });
    return records.map((record) => {
      const matchedVersion = record.versions[0] ?? record.currentVersion;
      const matchedText = matchedVersion?.ocrResult?.text ?? null;
      return {
        id: record.id,
        title: record.title,
        documentType: record.documentType,
        case: record.case,
        version: matchedVersion ? { id: matchedVersion.id, number: matchedVersion.versionNumber } : null,
        matchedText: matchedText ? this.snippet(matchedText, q) : null,
        ocrStatus: matchedVersion?.ocrResult?.status ?? 'PENDING',
      };
    });
  }

  private snippet(text: string, query: string) {
    const index = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
    const start = Math.max(0, index < 0 ? 0 : index - 80);
    const end = Math.min(text.length, start + 240);
    return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
  }
}
