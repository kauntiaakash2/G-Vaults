import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/storage/storage.service';

const integrationDatabaseUrl = 'postgresql://sih_test:sih_test_password@localhost:55432/sih_integration';

describe('real PostgreSQL and MinIO document journey (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let storageKey: string | undefined;

  const runId = randomUUID();
  const ownerEmail = `owner-${runId}@integration.local`;
  const outsiderEmail = `outsider-${runId}@integration.local`;
  const password = 'IntegrationPassword123!';
  const secret = `permission-scoped-${runId}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = integrationDatabaseUrl;
    process.env.JWT_SECRET = 'integration-jwt-secret-longer-than-thirty-two-characters';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.ENCRYPTION_KEY = '89abcdef0123456789abcdef0123456789abcdef0123456789abcdef01234567';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PORT = '59000';
    process.env.MINIO_USE_SSL = 'false';
    process.env.MINIO_ACCESS_KEY = 'sih_test_minio';
    process.env.MINIO_SECRET_KEY = 'sih_test_minio_password';
    process.env.MINIO_BUCKET = 'sih-integration-documents';
    process.env.MAX_UPLOAD_BYTES = '1048576';
    process.env.OCR_INTERNAL_TOKEN = 'integration-ocr-token-longer-than-thirty-two-characters';
    delete process.env.OCR_SERVICE_URL;

    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    storage = app.get(StorageService);

    // This database is provided only by docker-compose.integration.yml.
    // Resetting it makes repeated local runs deterministic without touching development data.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "roles" RESTART IDENTITY CASCADE');
    await seedPrincipals();
  });

  afterAll(async () => {
    if (storageKey) await storage.delete(storageKey).catch(() => undefined);
    if (app) await app.close();
  });

  it('persists encrypted evidence and enforces current database permissions', async () => {
    const ownerToken = await login(ownerEmail);
    const outsiderToken = await login(outsiderEmail);
    const caseRecord = await prisma.case.findUniqueOrThrow({ where: { caseNumber: `INT-${runId}` } });
    const outsider = await prisma.user.findUniqueOrThrow({ where: { email: outsiderEmail } });

    const uploadKey = `upload-${runId}`;
    const uploadRequest = (title = secret) => request(app.getHttpServer())
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', uploadKey)
      .field('caseId', caseRecord.id)
      .field('title', title)
      .field('documentType', 'REPORT')
      .attach('file', Buffer.from(`authoritative evidence ${secret}`), {
        filename: 'integration-evidence.txt',
        contentType: 'text/plain',
      });
    const upload = await uploadRequest().expect(201);

    const documentId = upload.body.id as string;
    const versionId = upload.body.currentVersion.id as string;
    expect(upload.body.revision).toBe(0);
    const replayedUpload = await uploadRequest().expect(201);
    expect(replayedUpload.body.id).toBe(documentId);
    expect(await prisma.document.count()).toBe(1);
    expect(await prisma.documentVersion.count()).toBe(1);
    await uploadRequest(`${secret}-changed`).expect(409);

    await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/record-status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'FINAL', reason: 'Integration concurrency check', expectedRevision: 0 })
      .expect(201)
      .expect(({ body }) => expect(body.revision).toBe(1));
    await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/record-status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'DRAFT', reason: 'Stale integration update', expectedRevision: 0 })
      .expect(409);

    const version = await prisma.documentVersion.findUniqueOrThrow({ where: { id: versionId } });
    storageKey = version.storageKey;

    const storedCiphertext = await storage.get(storageKey);
    expect(storedCiphertext.subarray(0, 4).toString()).toBe('SIH1');
    expect(storedCiphertext.includes(Buffer.from(secret))).toBe(false);
    expect(await prisma.processingJob.count({ where: { documentVersionId: versionId } })).toBe(1);

    const processKey = `process-${runId}`;
    await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/process`)
      .query({ versionId })
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', processKey)
      .expect(201)
      .expect(({ body }) => {
        expect(body.jobs[0].status).toBe('SUCCEEDED');
        expect(body.jobs[0].attempts).toBe(1);
        expect(body.jobs[0]).not.toHaveProperty('lockedBy');
      });
    const completedJob = await prisma.processingJob.findFirstOrThrow({ where: { documentVersionId: versionId } });
    expect(completedJob.status).toBe('SUCCEEDED');
    expect(completedJob.lockedAt).toBeNull();
    expect(completedJob.lockedBy).toBeNull();
    await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/process`)
      .query({ versionId })
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('Idempotency-Key', processKey)
      .expect(201);
    expect(await prisma.processingJob.count({ where: { documentVersionId: versionId } })).toBe(1);

    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect((response) => expect(response.text).toContain(secret));

    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    const isolatedSearch = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: secret })
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    expect(isolatedSearch.body).toEqual([]);

    const ownerSearch = await request(app.getHttpServer())
      .get('/api/search')
      .query({ q: secret })
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(ownerSearch.body).toHaveLength(1);

    const grant = await request(app.getHttpServer())
      .post(`/api/documents/${documentId}/access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: outsider.id, permission: 'VIEW', reason: 'Integration authorization check' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/documents/${documentId}/access/${grant.body.id as string}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Integration authorization check complete', expectedRevision: grant.body.revision })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/documents/${documentId}/verify`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('VERIFIED'));

    const actions = await prisma.auditEvent.findMany({ where: { documentId }, select: { action: true } });
    expect(actions.map(({ action }) => action)).toEqual(expect.arrayContaining([
      'DOCUMENT_UPLOADED',
      'DOCUMENT_DOWNLOADED',
      'ACCESS_GRANTED',
      'ACCESS_REVOKED',
      'INTEGRITY_VERIFIED',
    ]));
    expect(await prisma.custodyEvent.count({ where: { documentId } })).toBeGreaterThanOrEqual(3);
  });

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function seedPrincipals() {
    const passwordHash = await hash(password, 4);
    const role = await prisma.role.create({
      data: { code: 'INVESTIGATOR', name: 'Investigator' },
    });
    const ownerDepartment = await prisma.department.create({
      data: { code: `OWN-${runId}`, name: 'Integration Owner Department' },
    });
    const outsiderDepartment = await prisma.department.create({
      data: { code: `OUT-${runId}`, name: 'Integration Outsider Department' },
    });
    const owner = await prisma.user.create({
      data: {
        name: 'Integration Owner', email: ownerEmail, passwordHash,
        roleId: role.id, departmentId: ownerDepartment.id,
      },
    });
    await prisma.user.create({
      data: {
        name: 'Integration Outsider', email: outsiderEmail, passwordHash,
        roleId: role.id, departmentId: outsiderDepartment.id,
      },
    });
    const caseRecord = await prisma.case.create({
      data: {
        caseNumber: `INT-${runId}`, title: 'Infrastructure integration case',
        departmentId: ownerDepartment.id, createdById: owner.id,
      },
    });
    await prisma.caseMember.create({
      data: { caseId: caseRecord.id, userId: owner.id, caseRole: 'OWNER' },
    });
  }
});
