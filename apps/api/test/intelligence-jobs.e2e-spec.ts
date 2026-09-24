import { ProcessingJobStatus } from '@prisma/client';
import { IntelligenceService } from '../src/documents/intelligence.service';

describe('durable processing job lifecycle', () => {
  const version = {
    id: 'version-1',
    documentId: 'document-1',
    storageKey: 'cases/case-1/documents/document-1/versions/version-1',
    mimeType: 'text/plain',
    document: { caseId: 'case-1' },
  };

  function createHarness(jobOverrides: Record<string, unknown> = {}, processingError?: Error) {
    const job = {
      id: 'job-1',
      documentVersionId: version.id,
      type: 'OCR',
      status: ProcessingJobStatus.QUEUED,
      attempts: 0,
      maxAttempts: 3,
      nextAttemptAt: new Date(0),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      startedAt: null,
      completedAt: null,
      ...jobOverrides,
    };
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      documentVersion: { findUnique: jest.fn().mockResolvedValue(version) },
      processingJob: {
        findFirst: jest.fn().mockResolvedValue(job),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          Object.assign(job, data);
          return Promise.resolve(job);
        }),
      },
      ocrResult: {
        upsert: jest.fn().mockResolvedValue({ status: 'COMPLETED', text: 'extracted text' }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      aiSummary: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const storage = { get: jest.fn().mockResolvedValue(Buffer.from('encrypted')) };
    const encryption = { decrypt: jest.fn().mockReturnValue(Buffer.from('plain text')) };
    const authorization = {};
    const audit = { append: jest.fn().mockResolvedValue({}) };
    const ocrClient = {
      configured: jest.fn().mockReturnValue(true),
      process: processingError
        ? jest.fn().mockRejectedValue(processingError)
        : jest.fn().mockResolvedValue({ text: 'extracted text', page_count: 1, engine: 'TEST_OCR' }),
    };
    const service = new IntelligenceService(
      prisma as never,
      storage as never,
      encryption as never,
      authorization as never,
      audit as never,
      ocrClient as never,
    );
    return { service, job, updates, prisma, audit };
  }

  it('leases a queued job and clears the lease after success', async () => {
    const { service, updates, prisma } = createHarness();

    await expect(service.processVersion(version.id)).resolves.toEqual({ status: 'COMPLETED', text: 'extracted text' });

    expect(prisma.processingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ProcessingJobStatus.RUNNING, lockedBy: expect.any(String) }),
    }));
    expect(updates.at(-1)).toEqual(expect.objectContaining({
      status: ProcessingJobStatus.SUCCEEDED,
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    }));
  });

  it('schedules exponential retry after a transient worker failure', async () => {
    const { service, updates, audit } = createHarness({}, new Error('temporary worker outage'));

    await expect(service.processVersion(version.id)).rejects.toThrow('temporary worker outage');

    expect(updates.at(-1)).toEqual(expect.objectContaining({
      status: ProcessingJobStatus.RETRY_PENDING,
      lastError: 'Document processing failed',
      lockedAt: null,
      lockedBy: null,
      completedAt: null,
      nextAttemptAt: expect.any(Date),
    }));
    expect(audit.append).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'OCR_RETRY_SCHEDULED' }));
  });

  it('moves an exhausted transient failure to the dead state', async () => {
    const { service, updates } = createHarness({ attempts: 2 }, new Error('worker remains unavailable'));

    await expect(service.processVersion(version.id)).rejects.toThrow('worker remains unavailable');

    expect(updates.at(-1)).toEqual(expect.objectContaining({
      status: ProcessingJobStatus.DEAD,
      completedAt: expect.any(Date),
      lockedAt: null,
      lockedBy: null,
    }));
  });

  it('marks authenticated-decryption failure as non-retryable', async () => {
    const { service, updates } = createHarness();
    const harness = service as unknown as { encryption: { decrypt: jest.Mock } };
    harness.encryption.decrypt.mockImplementation(() => { throw new Error('authentication tag mismatch'); });

    await expect(service.processVersion(version.id)).rejects.toThrow('authentication tag mismatch');

    expect(updates.at(-1)).toEqual(expect.objectContaining({
      status: ProcessingJobStatus.FAILED,
      lastError: 'Stored document failed authenticated decryption',
      completedAt: expect.any(Date),
    }));
  });
});
