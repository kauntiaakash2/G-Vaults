import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  private readonly retentionMs = 24 * 60 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    key: string | undefined,
    userId: string,
    scope: string,
    requestFingerprint: unknown,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (!key) return operation();
    const normalizedKey = this.validateKey(key);
    const requestHash = this.hash(requestFingerprint);
    const expiresAt = new Date(Date.now() + this.retentionMs);

    await this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });

    let record: { id: string; requestHash: string; status: IdempotencyStatus; response: Prisma.JsonValue | null };
    try {
      record = await this.prisma.idempotencyRecord.create({
        data: { userId, scope, key: normalizedKey, requestHash, expiresAt },
        select: { id: true, requestHash: true, status: true, response: true },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      const existing = await this.prisma.idempotencyRecord.findUnique({
        where: { userId_scope_key: { userId, scope, key: normalizedKey } },
        select: { id: true, requestHash: true, status: true, response: true },
      });
      if (!existing) throw new ConflictException('The idempotent operation could not be resolved; retry later');
      record = existing;
    }

    if (record.requestHash !== requestHash) {
      throw new ConflictException('Idempotency-Key was already used with different request data');
    }
    if (record.status === IdempotencyStatus.COMPLETED) return record.response as T;
    if (record.response !== null) throw new ConflictException('The idempotent operation is already in progress');

    // The creator owns an IN_PROGRESS row with a null response. A concurrent
    // caller can also observe that shape, so claim it using a sentinel value.
    const claim = await this.prisma.idempotencyRecord.updateMany({
      where: { id: record.id, status: IdempotencyStatus.IN_PROGRESS, response: { equals: Prisma.DbNull } },
      data: { response: { state: 'CLAIMED' } },
    });
    if (claim.count !== 1) throw new ConflictException('The idempotent operation is already in progress');

    let result: T;
    try {
      result = await operation();
    } catch (error) {
      await this.prisma.idempotencyRecord.deleteMany({
        where: { id: record.id, status: IdempotencyStatus.IN_PROGRESS },
      });
      throw error;
    }

    const serializable = this.serializable(result);
    await this.prisma.idempotencyRecord.update({
      where: { id: record.id },
      data: { status: IdempotencyStatus.COMPLETED, response: serializable as Prisma.InputJsonValue },
    });
    return serializable;
  }

  fileFingerprint(file: Express.Multer.File | undefined) {
    return file
      ? {
          sha256: createHash('sha256').update(file.buffer).digest('hex'),
          size: file.size,
          mimeType: file.mimetype,
          filename: file.originalname,
        }
      : null;
  }

  private validateKey(value: string) {
    const key = value.trim();
    if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
      throw new BadRequestException('Idempotency-Key must be 8-128 safe ASCII characters');
    }
    return key;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(this.stableStringify(value)).digest('hex');
  }

  private stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    if (value && typeof value === 'object') {
      return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${this.stableStringify(item)}`)
        .join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
  }

  private serializable<T>(value: T) {
    return JSON.parse(JSON.stringify(value, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item)) as T;
  }
}
