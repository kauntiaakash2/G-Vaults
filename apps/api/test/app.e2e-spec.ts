import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MinioStorageService } from '../src/storage/minio-storage.service';
import { StorageService } from '../src/storage/storage.service';

const ids = {
  admin: '10000000-0000-4000-8000-000000000001',
  investigator: '10000000-0000-4000-8000-000000000002',
  outsider: '10000000-0000-4000-8000-000000000003',
  inactive: '10000000-0000-4000-8000-000000000004',
  department: '20000000-0000-4000-8000-000000000001',
  otherDepartment: '20000000-0000-4000-8000-000000000002',
  allowedCase: '30000000-0000-4000-8000-000000000001',
  deniedCase: '30000000-0000-4000-8000-000000000002',
};

describe('Phase 1 API (e2e)', () => {
  let app: INestApplication;
  let passwordHash: string;
  let users: any[];

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-that-is-longer-than-thirty-two-characters';
    process.env.JWT_EXPIRES_IN = '1h';
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.OCR_INTERNAL_TOKEN = 'test-only-ocr-token-longer-than-thirty-two-characters';
    passwordHash = await hash('CorrectPassword123!', 4);
    users = [
      user(ids.admin, 'admin@sih.local', 'ADMIN', 'ACTIVE'),
      user(ids.investigator, 'investigator@sih.local', 'INVESTIGATOR', 'ACTIVE'),
      user(ids.outsider, 'outsider@sih.local', 'INVESTIGATOR', 'ACTIVE', ids.otherDepartment),
      user(ids.inactive, 'inactive@sih.local', 'INVESTIGATOR', 'INACTIVE'),
    ];

    const caseRecords = [
      caseRecord(ids.allowedCase, ids.investigator, ids.department),
      caseRecord(ids.deniedCase, ids.outsider, ids.otherDepartment),
    ];
    const auditEvents: any[] = [];
    const prismaMock: any = {
      user: {
        findUnique: jest.fn(({ where }: any) => {
          const found = users.find((item) => item.id === where.id || item.email === where.email);
          return Promise.resolve(found ?? null);
        }),
        findMany: jest.fn(() => Promise.resolve([])),
      },
      case: {
        findMany: jest.fn(({ where }: any) => Promise.resolve(
          where?.members?.some?.userId
            ? caseRecords.filter((record) => record.members.some((member: any) => member.user.id === where.members.some.userId))
            : caseRecords,
        )),
        findFirst: jest.fn(({ where }: any) => Promise.resolve(
          caseRecords.find((record) =>
            record.id === where.id &&
            (!where.members?.some?.userId || record.members.some((member: any) => member.user.id === where.members.some.userId)),
          ) ?? null,
        )),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(
          caseRecords.find((record) => record.id === where.id) ?? null,
        )),
      },
      department: {
        findMany: jest.fn(() => Promise.resolve([])),
        findUnique: jest.fn(({ where }: any) => Promise.resolve(
          [ids.department, ids.otherDepartment].includes(where.id)
            ? { id: where.id, name: 'Department', code: 'DEPT' }
            : null,
        )),
      },
      auditEvent: {
        findFirst: jest.fn(() => Promise.resolve(auditEvents.at(-1) ?? null)),
        create: jest.fn(({ data }: any) => {
          auditEvents.push(data);
          return Promise.resolve(data);
        }),
      },
      $queryRaw: jest.fn(() => Promise.resolve([])),
      $executeRaw: jest.fn(() => Promise.resolve(0)),
    };
    prismaMock.$transaction = jest.fn((callback: (tx: any) => unknown) => callback(prismaMock));
    const storageMock = { put: jest.fn(), get: jest.fn(), exists: jest.fn(), delete: jest.fn() };

    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(StorageService)
      .useValue(storageMock)
      .overrideProvider(MinioStorageService)
      .useValue(storageMock)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => app.close());

  it('logs in with correct credentials and returns the current user', async () => {
    const token = await login('admin@sih.local', 'CorrectPassword123!');
    await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ id: ids.admin, role: 'ADMIN' }));
  });

  it('rejects a wrong password', () =>
    request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'admin@sih.local', password: 'WrongPassword123!' }).expect(401));

  it('rejects an inactive user', () =>
    request(app.getHttpServer()).post('/api/auth/login')
      .send({ email: 'inactive@sih.local', password: 'CorrectPassword123!' }).expect(401));

  it('rejects a missing token', () => request(app.getHttpServer()).get('/api/auth/me').expect(401));

  it('rejects an invalid token', () =>
    request(app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer invalid-token').expect(401));

  it('rejects an expired token', async () => {
    const jwt = app.get(JwtService);
    const token = await jwt.signAsync({ sub: ids.investigator, type: 'access' }, { expiresIn: -1 });
    await request(app.getHttpServer()).get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('allows an ADMIN role and denies an INVESTIGATOR role on the users endpoint', async () => {
    const adminToken = await login('admin@sih.local', 'CorrectPassword123!');
    const investigatorToken = await login('investigator@sih.local', 'CorrectPassword123!');
    await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${adminToken}`).expect(200);
    await request(app.getHttpServer()).get('/api/users').set('Authorization', `Bearer ${investigatorToken}`).expect(403);
  });

  it('allows an explicit case member', async () => {
    const token = await login('investigator@sih.local', 'CorrectPassword123!');
    await request(app.getHttpServer()).get(`/api/cases/${ids.allowedCase}`)
      .set('Authorization', `Bearer ${token}`).expect(200)
      .expect(({ body }) => expect(body.id).toBe(ids.allowedCase));
  });

  it('denies a non-member even when a case exists', async () => {
    const token = await login('investigator@sih.local', 'CorrectPassword123!');
    await request(app.getHttpServer()).get(`/api/cases/${ids.deniedCase}`)
      .set('Authorization', `Bearer ${token}`).expect(403);
  });

  it('denies non-admin case creation in another department', async () => {
    const token = await login('investigator@sih.local', 'CorrectPassword123!');
    await request(app.getHttpServer()).post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        caseNumber: 'CROSS-2026-001',
        title: 'Cross-department attempt',
        departmentId: ids.otherDepartment,
      })
      .expect(403);
  });

  async function login(email: string, password: string) {
    const response = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password }).expect(201);
    return response.body.accessToken as string;
  }

  function user(id: string, email: string, role: string, status: string, departmentId = ids.department) {
    return {
      id, email, name: email.split('@')[0], passwordHash, status, departmentId,
      roleId: `${role}-id`, role: { id: `${role}-id`, code: role, name: role },
      department: departmentId ? { id: departmentId, code: 'DEPT', name: 'Department' } : null,
      createdAt: new Date(), updatedAt: new Date(),
    };
  }

  function caseRecord(id: string, memberId: string, departmentId: string) {
    const member = users.find((item) => item.id === memberId) ?? { id: memberId, name: 'Member', email: 'member@sih.local' };
    return {
      id, caseNumber: `CASE-${id.slice(-4)}`, title: 'Test case', description: null,
      status: 'OPEN', departmentId, createdById: memberId,
      department: { id: departmentId, code: 'DEPT', name: 'Department' },
      createdBy: { id: memberId, name: member.name },
      members: [{ caseRole: 'OWNER', user: { id: memberId, name: member.name, email: member.email } }],
      _count: { documents: 0 }, createdAt: new Date(), updatedAt: new Date(),
    };
  }
});
