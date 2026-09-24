import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditResult,
  DocumentPermission,
  DocumentClassification,
  DocumentVersion,
  Prisma,
  VersionKind,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { CasesService } from '../cases/cases.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DocumentAuthorizationService } from './document-authorization.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { GrantAccessDto } from './dto/grant-access.dto';
import { FileValidationService } from './file-validation.service';
import { CustodyService } from './custody.service';
import { canAccessClassification, allowedClassifications } from './document-policy';
import { RevokeAccessDto } from './dto/records.dto';

const documentInclude = {
  case: { select: { id: true, caseNumber: true, title: true } },
  ownerDepartment: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
  currentVersion: { include: { creator: { select: { id: true, name: true } } } },
} satisfies Prisma.DocumentInclude;

type DocumentRecord = Prisma.DocumentGetPayload<{ include: typeof documentInclude }>;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly authorization: DocumentAuthorizationService,
    private readonly validator: FileValidationService,
    private readonly encryption: EncryptionService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly custody: CustodyService,
  ) {}

  async list(caseId: string, user: AuthenticatedUser) {
    const caseExists = await this.prisma.case.findUnique({ where: { id: caseId }, select: { id: true } });
    if (!caseExists) throw new NotFoundException('Case not found');
    const principal = [
      { userId: user.id },
      ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
    ];
    const now = new Date();
    const accessWhere: Prisma.DocumentWhereInput = {
      classification: { in: allowedClassifications(user) },
      AND: [
        user.role === 'AUDITOR' ? {} : {
            OR: [
              { createdById: user.id },
              { permissions: { some: {
                status: 'ACTIVE', validFrom: { lte: now },
                AND: [{ OR: principal }, { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
              } } },
            ],
          },
      ],
    };
    const records = await this.prisma.document.findMany({
      where: { caseId, ...accessWhere },
      include: documentInclude,
      orderBy: { updatedAt: 'desc' },
    });
    return records.map((record) => this.documentView(record));
  }

  async get(id: string, user: AuthenticatedUser) {
    const authorized = await this.authorization.authorize(id, user, DocumentPermission.VIEW);
    const record = await this.prisma.document.findUnique({ where: { id }, include: documentInclude });
    if (!record) throw new NotFoundException('Document not found');
    return {
      ...this.documentView(record),
      capabilities: this.authorization.capabilities(authorized, user),
    };
  }

  async create(
    dto: CreateDocumentDto,
    file: Express.Multer.File | undefined,
    user: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const caseRecord = await this.cases.findOne(dto.caseId, user);
    const classification = dto.classification ?? DocumentClassification.RESTRICTED;
    if (!canAccessClassification(user, classification)) {
      throw new BadRequestException('Your role cannot create a document at this classification');
    }
    const validated = this.validator.validate(file);
    const documentId = randomUUID();
    const versionId = randomUUID();
    const storageKey = this.storageKey(dto.caseId, documentId, versionId);
    const sha256Hash = this.checksum(validated.bytes);
    const encrypted = this.encryption.encrypt(validated.bytes, storageKey);
    await this.storage.put(storageKey, encrypted);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.document.create({
          data: {
            id: documentId,
            caseId: dto.caseId,
            title: dto.title.trim(),
            documentType: dto.documentType.trim().toUpperCase(),
            classification,
            ownerDepartmentId: caseRecord.department.id,
            createdById: user.id,
          },
        });
        await tx.documentVersion.create({
          data: {
            id: versionId,
            documentId,
            versionNumber: 1,
            storageKey,
            sha256Hash,
            fileSize: BigInt(validated.size),
            mimeType: validated.mimeType,
            originalFilename: validated.originalFilename,
            createdById: user.id,
            changeDescription: 'Initial upload',
            versionKind: VersionKind.ORIGINAL,
            isAuthoritative: true,
          },
        });
        await tx.document.update({ where: { id: documentId }, data: { currentVersionId: versionId } });
        await tx.processingJob.create({ data: { documentVersionId: versionId, type: 'OCR' } });
        await this.audit.append(
          {
            userId: user.id,
            action: 'DOCUMENT_UPLOADED',
            entityType: 'document',
            entityId: documentId,
            caseId: dto.caseId,
            documentId,
            versionId,
            ipAddress,
            metadata: { versionNumber: 1, sha256Hash, mimeType: validated.mimeType },
          },
          tx,
        );
        await this.custody.append({
          category: 'CUSTODY', type: 'UPLOADED', caseId: dto.caseId, documentId,
          versionId, actorId: user.id, details: { versionNumber: 1, versionKind: VersionKind.ORIGINAL, sha256Hash },
        }, tx);
      });
    } catch (error) {
      await this.cleanup(storageKey);
      throw error;
    }
    return this.get(documentId, user);
  }

  async createVersion(
    documentId: string,
    dto: CreateVersionDto,
    file: Express.Multer.File | undefined,
    user: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.EDIT);
    const versionKind = dto.versionKind ?? VersionKind.REVISION;
    const isDerived = versionKind === VersionKind.DERIVED || versionKind === VersionKind.REDACTED;
    if (isDerived !== Boolean(dto.sourceVersionId)) {
      throw new BadRequestException('DERIVED and REDACTED versions require sourceVersionId; revisions must not provide it');
    }
    if (dto.sourceVersionId) {
      const source = await this.prisma.documentVersion.findFirst({ where: { id: dto.sourceVersionId, documentId } });
      if (!source) throw new NotFoundException('Source version not found in this document');
    }
    const validated = this.validator.validate(file);
    const versionId = randomUUID();
    const storageKey = this.storageKey(document.caseId, documentId, versionId);
    const sha256Hash = this.checksum(validated.bytes);
    await this.storage.put(storageKey, this.encryption.encrypt(validated.bytes, storageKey));

    let created: DocumentVersion;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.documentVersion.aggregate({
          where: { documentId },
          _max: { versionNumber: true },
        });
        const versionNumber = (latest._max.versionNumber ?? 0) + 1;
        const version = await tx.documentVersion.create({
          data: {
            id: versionId,
            documentId,
            versionNumber,
            storageKey,
            sha256Hash,
            fileSize: BigInt(validated.size),
            mimeType: validated.mimeType,
            originalFilename: validated.originalFilename,
            createdById: user.id,
            changeDescription: dto.changeDescription?.trim(),
            versionKind,
            parentVersionId: document.currentVersionId,
            sourceVersionId: dto.sourceVersionId,
            isAuthoritative: !isDerived,
            transformationType: dto.transformationType?.trim(),
          },
        });
        await tx.document.update({ where: { id: documentId }, data: { currentVersionId: versionId } });
        await tx.processingJob.create({ data: { documentVersionId: versionId, type: 'OCR' } });
        await this.audit.append(
          {
            userId: user.id,
            action: 'VERSION_CREATED',
            entityType: 'document_version',
            entityId: versionId,
            caseId: document.caseId,
            documentId,
            versionId,
            ipAddress,
            metadata: { versionNumber, sha256Hash, changeDescription: dto.changeDescription ?? null },
          },
          tx,
        );
        await this.custody.append({
          category: 'CUSTODY', type: isDerived ? 'DERIVED' : 'UPLOADED', caseId: document.caseId,
          documentId, versionId, actorId: user.id,
          details: { versionNumber, versionKind, parentVersionId: document.currentVersionId, sourceVersionId: dto.sourceVersionId ?? null },
        }, tx);
        return version;
      });
    } catch (error) {
      await this.cleanup(storageKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A concurrent version was created; retry the upload');
      }
      throw error;
    }
    return this.versionView(created);
  }

  async versions(documentId: string, user: AuthenticatedUser) {
    await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      include: { creator: { select: { id: true, name: true } } },
      orderBy: { versionNumber: 'desc' },
    });
    return versions.map((version) => this.versionView(version));
  }

  async download(
    documentId: string,
    versionId: string | undefined,
    user: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.DOWNLOAD);
    return this.readAuthorizedVersion(document, versionId, user, 'DOCUMENT_DOWNLOADED', ipAddress);
  }

  async preview(
    documentId: string,
    versionId: string | undefined,
    user: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    return this.readAuthorizedVersion(document, versionId, user, 'DOCUMENT_VIEWED', ipAddress);
  }

  async verify(documentId: string, versionId: string | undefined, user: AuthenticatedUser) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    const version = await this.resolveVersion(document.id, document.currentVersionId, versionId);
    let verified = false;
    let reason = 'HASH_MISMATCH';
    try {
      const encrypted = await this.storage.get(version.storageKey);
      const bytes = this.encryption.decrypt(encrypted, version.storageKey);
      verified = this.checksum(bytes) === version.sha256Hash;
      reason = verified ? 'HASH_MATCH' : 'HASH_MISMATCH';
    } catch {
      reason = 'DECRYPTION_OR_AUTHENTICATION_FAILED';
    }
    await this.audit.append({
      userId: user.id,
      action: verified ? 'INTEGRITY_VERIFIED' : 'INTEGRITY_FAILED',
      entityType: 'document_version',
      entityId: version.id,
      caseId: document.caseId,
      documentId,
      versionId: version.id,
      result: verified ? AuditResult.SUCCESS : AuditResult.FAILURE,
      metadata: { expectedHash: version.sha256Hash, reason },
    });
    await this.custody.append({
      category: 'CUSTODY', type: 'VERIFIED', caseId: document.caseId, documentId,
      versionId: version.id, actorId: user.id, details: { verified, reason },
    });
    return {
      status: verified ? 'VERIFIED' : 'MISMATCH',
      versionId: version.id,
      versionNumber: version.versionNumber,
      sha256Hash: version.sha256Hash,
      checkedAt: new Date().toISOString(),
    };
  }

  async grantAccess(documentId: string, dto: GrantAccessDto, user: AuthenticatedUser) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.SHARE);
    if (Boolean(dto.departmentId) === Boolean(dto.userId)) {
      throw new BadRequestException('Provide exactly one of departmentId or userId');
    }
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : new Date();
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (validUntil && validUntil <= validFrom) throw new BadRequestException('validUntil must be later than validFrom');
    if (dto.departmentId && !(await this.prisma.department.findUnique({ where: { id: dto.departmentId } }))) {
      throw new NotFoundException('Department not found');
    }
    if (dto.userId && !(await this.prisma.user.findUnique({ where: { id: dto.userId } }))) {
      throw new NotFoundException('User not found');
    }
    const existing = await this.prisma.documentPermissionGrant.findFirst({
      where: {
        documentId,
        departmentId: dto.departmentId,
        userId: dto.userId,
        permission: dto.permission,
        status: 'ACTIVE',
      },
    });
    if (existing) {
      if (existing.validUntil && existing.validUntil <= new Date()) {
        await this.prisma.documentPermissionGrant.update({ where: { id: existing.id }, data: { status: 'EXPIRED' } });
      } else {
        throw new ConflictException('This permission is already active');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const permission = await tx.documentPermissionGrant.create({
        data: {
          documentId,
          departmentId: dto.departmentId,
          userId: dto.userId,
          permission: dto.permission,
          grantedById: user.id,
          reason: dto.reason?.trim(),
          validFrom,
          validUntil,
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          user: { select: { id: true, name: true, email: true } },
        },
      });
      await this.audit.append(
        {
          userId: user.id,
          action: 'ACCESS_GRANTED',
          entityType: 'document_permission',
          entityId: permission.id,
          caseId: document.caseId,
          documentId,
          metadata: {
            permission: dto.permission,
            departmentId: dto.departmentId ?? null,
            userId: dto.userId ?? null,
            reason: dto.reason ?? null,
            validFrom: validFrom.toISOString(),
            validUntil: validUntil?.toISOString() ?? null,
          },
        },
        tx,
      );
      await this.custody.append({
        category: 'ACCESS', type: 'ACCESS_GRANTED', caseId: document.caseId, documentId,
        actorId: user.id, details: { permissionId: permission.id, permission: dto.permission, reason: dto.reason ?? null },
      }, tx);
        return permission;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This permission is already active');
      }
      throw error;
    }
  }

  async revokeAccess(documentId: string, permissionId: string, dto: RevokeAccessDto, user: AuthenticatedUser) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.SHARE);
    const grant = await this.prisma.documentPermissionGrant.findFirst({ where: { id: permissionId, documentId } });
    if (!grant) throw new NotFoundException('Permission not found');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.documentPermissionGrant.updateMany({
        where: { id: permissionId, documentId, status: 'ACTIVE', revision: dto.expectedRevision },
        data: {
          status: 'REVOKED', revokedAt: new Date(), revokedById: user.id,
          revokeReason: dto.reason.trim(), revision: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Permission changed since it was loaded; refresh and retry');
      }
      await this.audit.append(
        {
          userId: user.id,
          action: 'ACCESS_REVOKED',
          entityType: 'document_permission',
          entityId: permissionId,
          caseId: document.caseId,
          documentId,
          metadata: { permission: grant.permission, departmentId: grant.departmentId, userId: grant.userId, reason: dto.reason },
        },
        tx,
      );
      await this.custody.append({
        category: 'ACCESS', type: 'ACCESS_REVOKED', caseId: document.caseId, documentId,
        actorId: user.id, details: { permissionId, permission: grant.permission, reason: dto.reason },
      }, tx);
      return tx.documentPermissionGrant.findUniqueOrThrow({ where: { id: permissionId } });
    });
  }

  async access(documentId: string, user: AuthenticatedUser) {
    await this.authorization.authorize(documentId, user, DocumentPermission.SHARE);
    return this.prisma.documentPermissionGrant.findMany({
      where: { documentId },
      include: {
        department: { select: { id: true, name: true, code: true } },
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true } },
        revokedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async auditTrail(documentId: string, user: AuthenticatedUser) {
    await this.authorization.authorize(documentId, user, DocumentPermission.VIEW);
    return this.prisma.auditEvent.findMany({
      where: { documentId },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        version: { select: { id: true, versionNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async securityStats(user: AuthenticatedUser) {
    const principal = [{ userId: user.id }, ...(user.departmentId ? [{ departmentId: user.departmentId }] : [])];
    const now = new Date();
    const scope: Prisma.DocumentWhereInput = {
      classification: { in: allowedClassifications(user) },
      ...(user.role === 'AUDITOR' ? {} : { OR: [
        { createdById: user.id },
        { permissions: { some: { status: 'ACTIVE', validFrom: { lte: now }, AND: [{ OR: principal }, { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }] } } },
      ] }),
    };
    const [documents, jobs, auditEvents] = await Promise.all([
      this.prisma.document.count({ where: scope }),
      this.prisma.processingJob.count({ where: { status: { in: ['QUEUED', 'RUNNING', 'RETRY_PENDING'] }, documentVersion: { document: scope } } }),
      this.prisma.auditEvent.count({ where: { document: scope } }),
    ]);
    return { documents, processing: jobs, auditEvents, encryption: 'AES-256-GCM' };
  }

  private async readAuthorizedVersion(
    document: { id: string; caseId: string; currentVersionId: string | null },
    requestedVersionId: string | undefined,
    user: AuthenticatedUser,
    action: 'DOCUMENT_DOWNLOADED' | 'DOCUMENT_VIEWED',
    ipAddress?: string,
  ) {
    const version = await this.resolveVersion(document.id, document.currentVersionId, requestedVersionId);
    let bytes: Buffer;
    try {
      const encrypted = await this.storage.get(version.storageKey);
      bytes = this.encryption.decrypt(encrypted, version.storageKey);
    } catch {
      await this.audit.append({
        userId: user.id,
        action: 'INTEGRITY_FAILED',
        entityType: 'document_version',
        entityId: version.id,
        caseId: document.caseId,
        documentId: document.id,
        versionId: version.id,
        result: AuditResult.FAILURE,
        metadata: { reason: 'DECRYPTION_OR_AUTHENTICATION_FAILED' },
      });
      throw new ConflictException('Stored document integrity verification failed');
    }
    if (this.checksum(bytes) !== version.sha256Hash) {
      await this.audit.append({
        userId: user.id,
        action: 'INTEGRITY_FAILED',
        entityType: 'document_version',
        entityId: version.id,
        caseId: document.caseId,
        documentId: document.id,
        versionId: version.id,
        result: AuditResult.FAILURE,
        metadata: { reason: 'HASH_MISMATCH' },
      });
      throw new ConflictException('Stored document integrity verification failed');
    }
    await this.audit.append({
      userId: user.id,
      action,
      entityType: 'document_version',
      entityId: version.id,
      caseId: document.caseId,
      documentId: document.id,
      versionId: version.id,
      ipAddress,
      metadata: { versionNumber: version.versionNumber },
    });
    await this.custody.append({
      category: 'CUSTODY', type: action === 'DOCUMENT_DOWNLOADED' ? 'DOWNLOADED' : 'ACCESSED',
      caseId: document.caseId, documentId: document.id, versionId: version.id, actorId: user.id,
      details: { versionNumber: version.versionNumber },
    });
    return { bytes, version: this.versionView(version) };
  }

  private async resolveVersion(documentId: string, currentVersionId: string | null, requested?: string) {
    const id = requested ?? currentVersionId;
    if (!id) throw new NotFoundException('Document has no current version');
    const version = await this.prisma.documentVersion.findFirst({ where: { id, documentId } });
    if (!version) throw new NotFoundException('Document version not found');
    return version;
  }

  private documentView(document: DocumentRecord) {
    return {
      ...document,
      currentVersion: document.currentVersion ? this.versionView(document.currentVersion) : null,
      encryption: 'AES-256-GCM',
    };
  }

  private versionView<T extends DocumentVersion & { creator?: { id: string; name: string } }>(version: T) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      sha256Hash: version.sha256Hash,
      fileSize: Number(version.fileSize),
      mimeType: version.mimeType,
      originalFilename: version.originalFilename,
      changeDescription: version.changeDescription,
      versionKind: version.versionKind,
      parentVersionId: version.parentVersionId,
      sourceVersionId: version.sourceVersionId,
      isAuthoritative: version.isAuthoritative,
      transformationType: version.transformationType,
      createdAt: version.createdAt,
      ...(version.creator ? { creator: version.creator } : {}),
    };
  }

  private storageKey(caseId: string, documentId: string, versionId: string) {
    return `cases/${caseId}/documents/${documentId}/versions/${versionId}`;
  }

  private checksum(data: Buffer) {
    return createHash('sha256').update(data).digest('hex');
  }

  private async cleanup(storageKey: string) {
    try {
      if (await this.storage.exists(storageKey)) await this.storage.delete(storageKey);
    } catch {
      // Cleanup is best effort; storage lifecycle rules should remove any residual orphan.
    }
  }
}
