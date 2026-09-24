import type { AuthenticatedUser } from '../src/common/auth-user';
import { AuditService } from '../src/audit/audit.service';
import { SearchService } from '../src/documents/intelligence.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Search authorization query', () => {
  it('applies the active user/department permission scope in the database query', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { document: { findMany } } as unknown as PrismaService;
    const audit = { append: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new SearchService(prisma, audit);
    const user: AuthenticatedUser = {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'investigator@sih.local',
      name: 'Investigator',
      role: 'INVESTIGATOR',
      departmentId: '20000000-0000-4000-8000-000000000001',
    };

    await service.search({ q: 'known-secret' }, user);

    const where = findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toMatchObject({
      classification: { in: ['INTERNAL', 'RESTRICTED'] },
      OR: [
        { createdById: user.id },
        {
          permissions: {
            some: {
              status: 'ACTIVE',
              AND: expect.arrayContaining([
                { OR: [{ userId: user.id }, { departmentId: user.departmentId }] },
              ]),
            },
          },
        },
      ],
    });
    expect(where.AND[1]).toMatchObject({
      OR: expect.arrayContaining([
        { title: { contains: 'known-secret', mode: 'insensitive' } },
        { versions: { some: { ocrResult: { text: { contains: 'known-secret', mode: 'insensitive' } } } } },
      ]),
    });
    expect(findMany.mock.calls[0][0].include.versions).toMatchObject({
      where: { ocrResult: { text: { contains: 'known-secret', mode: 'insensitive' } } },
      orderBy: { versionNumber: 'desc' },
      take: 1,
    });
  });

  it('returns the newest historical version whose OCR text matches', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      id: '30000000-0000-4000-8000-000000000001',
      title: 'Evidence report',
      documentType: 'REPORT',
      case: { id: '40000000-0000-4000-8000-000000000001', caseNumber: 'CASE-1', title: 'Case' },
      currentVersion: {
        id: '50000000-0000-4000-8000-000000000003',
        versionNumber: 3,
        ocrResult: { status: 'COMPLETED', text: 'new unrelated content' },
      },
      versions: [{
        id: '50000000-0000-4000-8000-000000000002',
        versionNumber: 2,
        ocrResult: { status: 'COMPLETED', text: 'Historical assignment evidence text' },
      }],
    }]);
    const prisma = { document: { findMany } } as unknown as PrismaService;
    const audit = { append: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new SearchService(prisma, audit);

    const results = await service.search({ q: 'assignment' }, {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'investigator@sih.local',
      name: 'Investigator',
      role: 'INVESTIGATOR',
      departmentId: '20000000-0000-4000-8000-000000000001',
    });

    expect(results[0]).toMatchObject({
      version: { number: 2 },
      matchedText: 'Historical assignment evidence text',
    });
  });
});
