/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MinioStorageService } from '../src/storage/minio-storage.service';
import { StorageService } from '../src/storage/storage.service';

const ids = {
  owner: '11000000-0000-4000-8000-000000000001',
  viewer: '11000000-0000-4000-8000-000000000002',
  outsider: '11000000-0000-4000-8000-000000000003',
  ownerDepartment: '21000000-0000-4000-8000-000000000001',
  viewerDepartment: '21000000-0000-4000-8000-000000000002',
  outsiderDepartment: '21000000-0000-4000-8000-000000000003',
  case: '31000000-0000-4000-8000-000000000001',
};

describe('Phase 2 document security API (e2e)', () => {
  let app: INestApplication;
  let ownerToken: string;
  let viewerToken: string;
  let outsiderToken: string;
  let documentId: string;
  let permissionId: string;
  let firstVersionId: string;
  const objects = new Map<string, Buffer>();
  const documents: any[] = [];
  const versions: any[] = [];
  const grants: any[] = [];
  const auditEvents: any[] = [];
  const jobs: any[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.OCR_INTERNAL_TOKEN = 'test-only-ocr-token-longer-than-thirty-two-characters';
    process.env.MAX_UPLOAD_BYTES = '64';
    const passwordHash = await hash('CorrectPassword123!', 4);
    const departments = [
      department(ids.ownerDepartment, 'OWN', 'Owner Department'),
      department(ids.viewerDepartment, 'VIEW', 'Viewer Department'),
      department(ids.outsiderDepartment, 'OUT', 'Outsider Department'),
    ];
    const users = [
      user(ids.owner, 'owner@sih.local', ids.ownerDepartment, passwordHash),
      user(ids.viewer, 'viewer@sih.local', ids.viewerDepartment, passwordHash),
      user(ids.outsider, 'outsider@sih.local', ids.outsiderDepartment, passwordHash),
    ];
    const caseRecord = {
      id: ids.case,
      caseNumber: 'DOC-2026-001',
      title: 'Document security case',
      description: null,
      departmentId: ids.ownerDepartment,
      status: 'OPEN',
      createdById: ids.owner,
      department: departments[0],
      createdBy: { id: ids.owner, name: 'Owner' },
      members: [{ caseRole: 'OWNER', user: { id: ids.owner, name: 'Owner', email: 'owner@sih.local' } }],
      _count: { documents: 0 },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prismaMock: any = {
      user: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(users.find((item) => item.id === where.id || item.email === where.email) ?? null)),
      },
      department: {
        findUnique: jest.fn(({ where }: any) => Promise.resolve(departments.find((item) => item.id === where.id) ?? null)),
        findMany: jest.fn(() => Promise.resolve(departments)),
      },
      case: {
        findFirst: jest.fn(({ where }: any) => Promise.resolve(
          where.id === ids.case && (!where.members?.some?.userId || where.members.some.userId === ids.owner) ? caseRecord : null,
        )),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(where.id === ids.case ? caseRecord : null)),
      },
      document: {
        create: jest.fn(({ data }: any) => {
          const record = { ...data, currentVersionId: null, createdAt: new Date(), updatedAt: new Date() };
          documents.push(record);
          caseRecord._count.documents += 1;
          return Promise.resolve(record);
        }),
        update: jest.fn(({ where, data }: any) => {
          const record = documents.find((item) => item.id === where.id);
          Object.assign(record, data, { updatedAt: new Date() });
          return Promise.resolve(record);
        }),
        findUnique: jest.fn(({ where, include }: any) => Promise.resolve(hydrateDocument(where.id, include))),
        findMany: jest.fn(({ where }: any) => Promise.resolve(
          documents.filter((item) => item.caseId === where.caseId).map((item) => hydrateDocument(item.id, {})),
        )),
      },
      documentVersion: {
        create: jest.fn(({ data }: any) => {
          const record = { ...data, createdAt: new Date() };
          versions.push(record);
          return Promise.resolve(record);
        }),
        aggregate: jest.fn(({ where }: any) => Promise.resolve({
          _max: { versionNumber: Math.max(0, ...versions.filter((item) => item.documentId === where.documentId).map((item) => item.versionNumber)) || null },
        })),
        findFirst: jest.fn(({ where }: any) => Promise.resolve(versions.find((item) => item.id === where.id && item.documentId === where.documentId) ?? null)),
        findMany: jest.fn(({ where }: any) => Promise.resolve(
          versions.filter((item) => item.documentId === where.documentId)
            .sort((left, right) => right.versionNumber - left.versionNumber)
            .map((item) => ({ ...item, creator: basicUser(item.createdById) })),
        )),
      },
      documentPermissionGrant: {
        findFirst: jest.fn(({ where }: any) => Promise.resolve(grants.find((item) =>
          (!where.id || item.id === where.id) && item.documentId === where.documentId &&
          (!where.status || item.status === where.status) && (!where.permission || item.permission === where.permission) &&
          (where.departmentId === undefined || item.departmentId === where.departmentId) &&
          (where.userId === undefined || item.userId === where.userId),
        ) ?? null)),
        create: jest.fn(({ data }: any) => {
          const record = { id: randomUUID(), ...data, userId: data.userId ?? null, departmentId: data.departmentId ?? null, status: 'ACTIVE', createdAt: new Date(), revokedAt: null };
          grants.push(record);
          return Promise.resolve(hydrateGrant(record));
        }),
        update: jest.fn(({ where, data }: any) => {
          const record = grants.find((item) => item.id === where.id);
          Object.assign(record, data);
          return Promise.resolve(record);
        }),
        findMany: jest.fn(({ where }: any) => Promise.resolve(grants.filter((item) => item.documentId === where.documentId).map(hydrateGrant))),
      },
      processingJob: {
        create: jest.fn(({ data }: any) => {
          const record = { id: randomUUID(), ...data, status: 'PENDING', createdAt: new Date(), updatedAt: new Date() };
          jobs.push(record);
          return Promise.resolve(record);
        }),
      },
      auditEvent: {
        findFirst: jest.fn(() => Promise.resolve(auditEvents.at(-1) ?? null)),
        create: jest.fn(({ data }: any) => {
          auditEvents.push(data);
          return Promise.resolve(data);
        }),
        findMany: jest.fn(({ where }: any) => Promise.resolve(auditEvents.filter((item) => item.documentId === where.documentId).reverse().map((item) => ({
          ...item,
          actor: item.userId ? basicUser(item.userId) : null,
          version: item.versionId ? versions.find((version) => version.id === item.versionId) ?? null : null,
        })))),
      },
      $queryRaw: jest.fn(() => Promise.resolve([])),
      $executeRaw: jest.fn(() => Promise.resolve(0)),
    };
    prismaMock.$transaction = jest.fn((callback: (tx: any) => unknown) => callback(prismaMock));

    const storageMock = {
      put: jest.fn((key: string, data: Buffer) => { objects.set(key, Buffer.from(data)); return Promise.resolve(); }),
      get: jest.fn((key: string) => {
        const value = objects.get(key);
        if (!value) return Promise.reject(new Error('Not found'));
        return Promise.resolve(Buffer.from(value));
      }),
      exists: jest.fn((key: string) => Promise.resolve(objects.has(key))),
      delete: jest.fn((key: string) => { objects.delete(key); return Promise.resolve(); }),
    };

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue(prismaMock)
      .overrideProvider(StorageService).useValue(storageMock)
      .overrideProvider(MinioStorageService).useValue(storageMock)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    ownerToken = await login('owner@sih.local');
    viewerToken = await login('viewer@sih.local');
    outsiderToken = await login('outsider@sih.local');

    function hydrateDocument(id: string, include: any) {
      const record = documents.find((item) => item.id === id);
      if (!record) return null;
      const current = versions.find((item) => item.id === record.currentVersionId);
      let permissionRows = grants.filter((item) => item.documentId === id);
      const permissionWhere = include?.permissions?.where;
      if (permissionWhere) {
        permissionRows = permissionRows.filter((item) =>
          item.status === permissionWhere.status && permissionWhere.permission.in.includes(item.permission) &&
          permissionWhere.OR.some((principal: any) =>
            (principal.userId && item.userId === principal.userId) ||
            (principal.departmentId && item.departmentId === principal.departmentId),
          ),
        );
      }
      return {
        ...record,
        case: { id: caseRecord.id, caseNumber: caseRecord.caseNumber, title: caseRecord.title, departmentId: caseRecord.departmentId },
        ownerDepartment: departments.find((item) => item.id === record.ownerDepartmentId),
        createdBy: basicUser(record.createdById),
        currentVersion: current ? { ...current, creator: basicUser(current.createdById) } : null,
        permissions: permissionRows,
      };
    }

    function hydrateGrant(record: any) {
      return {
        ...record,
        department: departments.find((item) => item.id === record.departmentId) ?? null,
        user: users.find((item) => item.id === record.userId) ?? null,
        grantedBy: basicUser(record.grantedById),
      };
    }

    function basicUser(id: string) {
      const found = users.find((item) => item.id === id);
      return found ? { id: found.id, name: found.name, email: found.email } : null;
    }
  });

  afterAll(async () => app.close());

  it('rejects an invalid file signature', async () => {
    await upload(ownerToken, Buffer.from('not a pdf'), 'invalid.pdf', 'application/pdf').expect(400);
  });

  it('rejects an extension and MIME mismatch', async () => {
    await upload(ownerToken, Buffer.from('%PDF-1.7\nfixture'), 'spoofed.pdf', 'text/plain').expect(400);
  });

  it('rejects an oversized upload', async () => {
    await upload(ownerToken, Buffer.alloc(80, 65), 'large.pdf', 'application/pdf').expect(413);
  });

  it('uploads, encrypts, and safely normalizes a path-like filename', async () => {
    const response = await upload(ownerToken, Buffer.from('%PDF-1.7\nphase-two'), '../../evidence.pdf', 'application/pdf').expect(201);
    documentId = response.body.id as string;
    firstVersionId = response.body.currentVersion.id as string;
    expect(response.body.currentVersion.originalFilename).toBe('evidence.pdf');
    expect(response.body.currentVersion).not.toHaveProperty('storageKey');
    expect(response.body.currentVersion).not.toHaveProperty('createdById');
    expect(response.body.currentVersion).not.toHaveProperty('documentId');
    expect(response.body.capabilities).toEqual({ view: true, download: true, edit: true, share: true, approve: true });
    expect(response.body.encryption).toBe('AES-256-GCM');
    const stored = versions.find((item) => item.id === firstVersionId);
    expect(objects.get(stored.storageKey)?.subarray(0, 4).toString()).toBe('SIH1');
    expect(objects.get(stored.storageKey)?.includes(Buffer.from('phase-two'))).toBe(false);
  });

  it('shares VIEW access with a department', async () => {
    const response = await request(app.getHttpServer()).post(`/api/documents/${documentId}/access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ departmentId: ids.viewerDepartment, permission: 'VIEW' })
      .expect(201);
    permissionId = response.body.id as string;
  });

  it('allows a user with VIEW to read metadata but not download', async () => {
    await request(app.getHttpServer()).get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${viewerToken}`).expect(200)
      .expect(({ body }) => expect(body.capabilities).toEqual({ view: true, download: false, edit: false, share: false, approve: false }));
    await request(app.getHttpServer()).get(`/api/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${viewerToken}`).expect(403);
    await request(app.getHttpServer()).post(`/api/documents/${documentId}/access`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ userId: ids.outsider, permission: 'VIEW' })
      .expect(403);
  });

  it('does not let SHARE permission imply DOWNLOAD permission', async () => {
    const response = await request(app.getHttpServer()).post(`/api/documents/${documentId}/access`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: ids.outsider, permission: 'SHARE' })
      .expect(201);
    await request(app.getHttpServer()).get(`/api/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${outsiderToken}`).expect(403);
    await request(app.getHttpServer()).delete(`/api/documents/${documentId}/access/${response.body.id}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
  });

  it('denies a user without access even when they supply a valid document ID', async () => {
    await request(app.getHttpServer()).get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${outsiderToken}`).expect(403);
  });

  it('creates version 2 without overwriting version 1 and can download both', async () => {
    await request(app.getHttpServer()).post(`/api/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .field('changeDescription', 'Updated findings')
      .attach('file', Buffer.from('%PDF-1.7\nversion-two'), { filename: 'evidence-v2.pdf', contentType: 'application/pdf' })
      .expect(201)
      .expect(({ body }) => expect(body.versionNumber).toBe(2));
    const history = await request(app.getHttpServer()).get(`/api/documents/${documentId}/versions`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    expect(history.body.map((item: any) => item.versionNumber)).toEqual([2, 1]);
    await request(app.getHttpServer()).get(`/api/documents/${documentId}/download?versionId=${firstVersionId}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200)
      .expect((response) => expect(response.body.toString()).toContain('phase-two'));
    await request(app.getHttpServer()).get(`/api/documents/${documentId}/download?versionId=${firstVersionId}`)
      .set('Authorization', `Bearer ${outsiderToken}`).expect(403);
    await request(app.getHttpServer()).get(`/api/documents/${documentId}/download`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200)
      .expect((response) => expect(response.body.toString()).toContain('version-two'));
  });

  it('revokes access immediately', async () => {
    await request(app.getHttpServer()).delete(`/api/documents/${documentId}/access/${permissionId}`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200);
    await request(app.getHttpServer()).get(`/api/documents/${documentId}`)
      .set('Authorization', `Bearer ${viewerToken}`).expect(403);
  });

  it('returns an integrity mismatch for a tampered encrypted object', async () => {
    const current = documents.find((item) => item.id === documentId);
    const version = versions.find((item) => item.id === current.currentVersionId);
    objects.set(version.storageKey, Buffer.from('tampered encrypted payload'));
    await request(app.getHttpServer()).get(`/api/documents/${documentId}/verify`)
      .set('Authorization', `Bearer ${ownerToken}`).expect(200)
      .expect(({ body }) => expect(body.status).toBe('MISMATCH'));
    expect(auditEvents.some((event) => event.action === 'INTEGRITY_FAILED')).toBe(true);
  });

  function upload(token: string, bytes: Buffer, filename: string, contentType: string) {
    return request(app.getHttpServer()).post('/api/documents')
      .set('Authorization', `Bearer ${token}`)
      .field('caseId', ids.case)
      .field('title', 'Evidence report')
      .field('documentType', 'REPORT')
      .attach('file', bytes, { filename, contentType });
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer()).post('/api/auth/login')
      .send({ email, password: 'CorrectPassword123!' }).expect(201);
    return response.body.accessToken as string;
  }

  function department(id: string, code: string, name: string) {
    return { id, code, name, description: null, createdAt: new Date(), updatedAt: new Date() };
  }

  function user(id: string, email: string, departmentId: string, passwordHash: string) {
    return {
      id, email, name: email.split('@')[0], passwordHash, status: 'ACTIVE', departmentId,
      roleId: 'INVESTIGATOR-id', role: { id: 'INVESTIGATOR-id', code: 'INVESTIGATOR', name: 'Investigator' },
      department: { id: departmentId, code: 'DEPT', name: 'Department' },
      createdAt: new Date(), updatedAt: new Date(),
    };
  }
});
