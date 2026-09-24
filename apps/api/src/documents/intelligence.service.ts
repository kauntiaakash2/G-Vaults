import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentPermission, Prisma, ProcessingJobStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { DocumentAuthorizationService } from './document-authorization.service';
import { EncryptionService } from '../encryption/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrClientService } from './ocr-client.service';
import { allowedClassifications } from './document-policy';

@Injectable()
export class IntelligenceService {
  private readonly leaseDurationMs = 60_000;
  private readonly retryBaseDelayMs = 5_000;

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
    return { versionId: version?.id ?? null, ocr: version?.ocrResult ?? null, summary: version?.aiSummary ?? null, jobs: jobs.map((job) => this.jobView(job)) };
  }

  async processVersion(versionId: string) {
    const version = await this.prisma.documentVersion.findUnique({ where: { id: versionId }, include: { document: true } });
    if (!version) throw new NotFoundException('Document version not found');
    const now = new Date();
    const staleBefore = new Date(now.getTime() - this.leaseDurationMs);
    const job = await this.prisma.processingJob.findFirst({
      where: {
        documentVersionId: versionId,
        type: 'OCR',
        OR: [
          { status: ProcessingJobStatus.QUEUED, nextAttemptAt: { lte: now } },
          { status: ProcessingJobStatus.RETRY_PENDING, nextAttemptAt: { lte: now } },
          { status: ProcessingJobStatus.RUNNING, lockedAt: { lte: staleBefore } },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return this.statusForVersion(versionId);

    if (job.attempts >= job.maxAttempts) {
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: ProcessingJobStatus.DEAD,
          completedAt: now,
          lockedAt: null,
          lockedBy: null,
          lastError: job.lastError ?? 'Maximum processing attempts exhausted',
        },
      });
      return this.statusForVersion(versionId);
    }

    const workerId = randomUUID();
    const claim = await this.prisma.processingJob.updateMany({
      where: {
        id: job.id,
        status: job.status,
        ...(job.status === ProcessingJobStatus.RUNNING ? { lockedAt: { lte: staleBefore } } : {}),
      },
      data: {
        status: ProcessingJobStatus.RUNNING,
        attempts: { increment: 1 },
        startedAt: now,
        completedAt: null,
        lockedAt: now,
        lockedBy: workerId,
      },
    });
    if (claim.count !== 1) return this.statusForVersion(versionId);

    const attempt = job.attempts + 1;
    await this.audit.append({
      action: 'OCR_STARTED', entityType: 'document_version', entityId: versionId,
      caseId: version.document.caseId, documentId: version.documentId, versionId,
      metadata: { jobId: job.id, attempt, maxAttempts: job.maxAttempts },
    });

    let failureStage: 'STORAGE' | 'DECRYPTION' | 'PROCESSING' = 'STORAGE';
    try {
      const encrypted = await this.storage.get(version.storageKey);
      failureStage = 'DECRYPTION';
      const bytes = this.encryption.decrypt(encrypted, version.storageKey);
      failureStage = 'PROCESSING';
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
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status: ProcessingJobStatus.SUCCEEDED,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      await this.audit.append({
        action: 'OCR_COMPLETED', entityType: 'document_version', entityId: versionId,
        caseId: version.document.caseId, documentId: version.documentId, versionId,
        metadata: { jobId: job.id, attempt, engine: extracted.engine, pageCount: extracted.pageCount },
      });
      return result;
    } catch (error) {
      const retryable = failureStage !== 'DECRYPTION';
      const exhausted = attempt >= job.maxAttempts;
      const status = !retryable
        ? ProcessingJobStatus.FAILED
        : exhausted
          ? ProcessingJobStatus.DEAD
          : ProcessingJobStatus.RETRY_PENDING;
      const terminal = status === ProcessingJobStatus.FAILED || status === ProcessingJobStatus.DEAD;
      const retryAt = new Date(Date.now() + this.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1));
      await this.prisma.processingJob.update({
        where: { id: job.id },
        data: {
          status,
          lastError: this.safeProcessingError(failureStage, error),
          nextAttemptAt: terminal ? now : retryAt,
          completedAt: terminal ? new Date() : null,
          lockedAt: null,
          lockedBy: null,
        },
      });
      await this.audit.append({
        action: status === ProcessingJobStatus.RETRY_PENDING ? 'OCR_RETRY_SCHEDULED' : 'OCR_PROCESSING_TERMINATED',
        entityType: 'document_version', entityId: versionId,
        caseId: version.document.caseId, documentId: version.documentId, versionId,
        result: 'FAILURE',
        metadata: { jobId: job.id, attempt, maxAttempts: job.maxAttempts, stage: failureStage, status },
      });
      throw error;
    }
  }

  async run(documentId: string, user: AuthenticatedUser, requestedVersionId?: string) {
    const document = await this.authorization.authorize(documentId, user, DocumentPermission.EDIT);
    const versionId = requestedVersionId ?? document.currentVersionId;
    await this.audit.append({ userId: user.id, action: 'OCR_PROCESSING_REQUESTED', entityType: 'document', entityId: documentId, caseId: document.caseId, documentId, versionId });
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
      const active = await this.prisma.processingJob.findFirst({
        where: {
          documentVersionId: versionId,
          type: 'OCR',
          status: { in: [ProcessingJobStatus.QUEUED, ProcessingJobStatus.RUNNING, ProcessingJobStatus.RETRY_PENDING] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (active?.status === ProcessingJobStatus.RETRY_PENDING) {
        await this.prisma.processingJob.update({
          where: { id: active.id },
          data: { status: ProcessingJobStatus.QUEUED, nextAttemptAt: new Date() },
        });
      } else if (!active) {
        try {
          await this.prisma.processingJob.create({ data: { documentVersionId: versionId, type: 'OCR' } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
        }
      }
      await this.processVersion(versionId);
    }
    return this.status(documentId, user, versionId ?? undefined);
  }

  private async statusForVersion(versionId: string) {
    return this.prisma.ocrResult.findUnique({ where: { documentVersionId: versionId } });
  }

  private jobView(job: {
    id: string;
    type: string;
    status: ProcessingJobStatus;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: Date;
    lastError: string | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
  }) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt,
      lastError: job.lastError,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
    };
  }

  private safeProcessingError(stage: 'STORAGE' | 'DECRYPTION' | 'PROCESSING', error: unknown) {
    if (stage === 'STORAGE') return 'Stored encrypted object could not be read';
    if (stage === 'DECRYPTION') return 'Stored document failed authenticated decryption';
    const message = error instanceof Error ? error.message : '';
    return message.startsWith('OCR service ') ? message.slice(0, 500) : 'Document processing failed';
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
    const now = new Date();
    const scope: Prisma.DocumentWhereInput = {
      classification: { in: allowedClassifications(user) },
      ...(user.role === 'AUDITOR' ? {} : { OR: [
        { createdById: user.id },
        { permissions: { some: {
          status: 'ACTIVE', validFrom: { lte: now },
          AND: [{ OR: principal }, { OR: [{ validUntil: null }, { validUntil: { gt: now } }] }],
        } } },
      ] }),
    };
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
        classification: record.classification,
        recordStatus: record.recordStatus,
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
