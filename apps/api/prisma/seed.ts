import { PrismaClient, UserStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const roleDefinitions = [
    ['ADMIN', 'Administrator'],
    ['INVESTIGATOR', 'Investigator'],
    ['SENIOR_OFFICER', 'Senior Officer'],
    ['DEPARTMENT_HEAD', 'Department Head'],
    ['AUDITOR', 'Auditor'],
  ] as const;

  const roles = Object.fromEntries(
    await Promise.all(
      roleDefinitions.map(async ([code, name]) => {
        const role = await prisma.role.upsert({
          where: { code },
          update: { name },
          create: { code, name },
        });
        return [code, role] as const;
      }),
    ),
  );

  const cyber = await prisma.department.upsert({
    where: { code: 'CYBER' },
    update: {},
    create: { name: 'Cyber Crime Unit', code: 'CYBER', description: 'Digital crime investigations' },
  });
  const financial = await prisma.department.upsert({
    where: { code: 'FIN' },
    update: {},
    create: { name: 'Financial Crime Unit', code: 'FIN', description: 'Financial fraud investigations' },
  });

  const adminPassword = await hash(process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!', 12);
  const userPassword = await hash(process.env.SEED_USER_PASSWORD ?? 'ChangeMe123!', 12);
  const definitions = [
    { name: 'Admin', email: 'admin@sih.local', role: 'ADMIN', departmentId: null, passwordHash: adminPassword },
    { name: 'Department Head', email: 'head@sih.local', role: 'DEPARTMENT_HEAD', departmentId: cyber.id, passwordHash: userPassword },
    { name: 'Investigator A', email: 'investigator.a@sih.local', role: 'INVESTIGATOR', departmentId: cyber.id, passwordHash: userPassword },
    { name: 'Investigator B', email: 'investigator.b@sih.local', role: 'INVESTIGATOR', departmentId: financial.id, passwordHash: userPassword },
    { name: 'Auditor', email: 'auditor@sih.local', role: 'AUDITOR', departmentId: null, passwordHash: userPassword },
    { name: 'Inactive User', email: 'inactive@sih.local', role: 'INVESTIGATOR', departmentId: cyber.id, passwordHash: userPassword, status: UserStatus.INACTIVE },
  ] as const;

  const users: Record<string, { id: string }> = {};
  for (const definition of definitions) {
    const user = await prisma.user.upsert({
      where: { email: definition.email },
      update: {
        name: definition.name,
        passwordHash: definition.passwordHash,
        roleId: roles[definition.role].id,
        departmentId: definition.departmentId,
        status: 'status' in definition ? definition.status : UserStatus.ACTIVE,
      },
      create: {
        name: definition.name,
        email: definition.email,
        passwordHash: definition.passwordHash,
        roleId: roles[definition.role].id,
        departmentId: definition.departmentId,
        status: 'status' in definition ? definition.status : UserStatus.ACTIVE,
      },
    });
    users[definition.email] = user;
  }

  const cyberCase = await prisma.case.upsert({
    where: { caseNumber: 'CYB-2026-001' },
    update: {},
    create: {
      caseNumber: 'CYB-2026-001',
      title: 'Phishing campaign investigation',
      description: 'Seed case for testing explicit cyber-department membership.',
      departmentId: cyber.id,
      createdById: users['investigator.a@sih.local'].id,
    },
  });
  const financialCase = await prisma.case.upsert({
    where: { caseNumber: 'FIN-2026-001' },
    update: {},
    create: {
      caseNumber: 'FIN-2026-001',
      title: 'Invoice fraud investigation',
      description: 'Seed case for testing cross-department denial.',
      departmentId: financial.id,
      createdById: users['investigator.b@sih.local'].id,
    },
  });
  const cyberFollowup = await prisma.case.upsert({
    where: { caseNumber: 'CYB-2026-002' },
    update: {},
    create: { caseNumber: 'CYB-2026-002', title: 'Credential-stuffing investigation', description: 'Fictional demo case for search and versioning.', departmentId: cyber.id, createdById: users['investigator.a@sih.local'].id },
  });
  const financialFollowup = await prisma.case.upsert({
    where: { caseNumber: 'FIN-2026-002' },
    update: {},
    create: { caseNumber: 'FIN-2026-002', title: 'Procurement anomaly review', description: 'Fictional demo case for cross-department access.', departmentId: financial.id, createdById: users['investigator.b@sih.local'].id },
  });

  await prisma.caseMember.upsert({
    where: { caseId_userId: { caseId: cyberCase.id, userId: users['investigator.a@sih.local'].id } },
    update: { caseRole: 'OWNER' },
    create: { caseId: cyberCase.id, userId: users['investigator.a@sih.local'].id, caseRole: 'OWNER' },
  });
  for (const caseRecord of [cyberFollowup, financialFollowup]) {
    const owner = caseRecord.departmentId === cyber.id ? users['investigator.a@sih.local'] : users['investigator.b@sih.local'];
    await prisma.caseMember.upsert({ where: { caseId_userId: { caseId: caseRecord.id, userId: owner.id } }, update: { caseRole: 'OWNER' }, create: { caseId: caseRecord.id, userId: owner.id, caseRole: 'OWNER' } });
  }
  await prisma.caseMember.upsert({
    where: { caseId_userId: { caseId: financialCase.id, userId: users['investigator.b@sih.local'].id } },
    update: { caseRole: 'OWNER' },
    create: { caseId: financialCase.id, userId: users['investigator.b@sih.local'].id, caseRole: 'OWNER' },
  });

  console.log('Seed complete. Login with admin@sih.local and the configured SEED_ADMIN_PASSWORD.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
