import { Injectable } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type AuditClient = Prisma.TransactionClient;

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  caseId?: string | null;
  documentId?: string | null;
  versionId?: string | null;
  result?: AuditResult;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  append(input: AuditInput, transaction?: AuditClient) {
    if (transaction) return this.appendInTransaction(input, transaction);
    return this.prisma.$transaction((tx) => this.appendInTransaction(input, tx));
  }

  private async appendInTransaction(input: AuditInput, tx: AuditClient) {
    // pg_advisory_xact_lock returns PostgreSQL `void`; use executeRaw so Prisma
    // does not attempt to deserialize that value as a result set.
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(26190)`);
    const previous = await tx.auditEvent.findFirst({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const id = randomUUID();
    const createdAt = new Date();
    const previousHash = previous?.eventHash ?? null;
    const result = input.result ?? AuditResult.SUCCESS;
    const hashBody = stableJson({ id, ...input, result, previousHash, createdAt: createdAt.toISOString() });
    const eventHash = createHash('sha256').update(hashBody).digest('hex');
    return tx.auditEvent.create({
      data: {
        id,
        userId: input.userId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        caseId: input.caseId,
        documentId: input.documentId,
        versionId: input.versionId,
        result,
        metadata: input.metadata,
        ipAddress: input.ipAddress,
        previousHash,
        eventHash,
        createdAt,
      },
    });
  }
}
