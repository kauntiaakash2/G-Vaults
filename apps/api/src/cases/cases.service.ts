import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseDto } from './dto/create-case.dto';

const caseInclude = {
  department: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
  members: {
    select: {
      caseRole: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  _count: { select: { documents: true } },
} satisfies Prisma.CaseInclude;

@Injectable()
export class CasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private accessFilter(user: AuthenticatedUser): Prisma.CaseWhereInput {
    if (user.role === 'ADMIN' || user.role === 'AUDITOR') return {};
    if (user.role === 'DEPARTMENT_HEAD' && user.departmentId) {
      return { departmentId: user.departmentId };
    }
    return { members: { some: { userId: user.id } } };
  }

  list(user: AuthenticatedUser) {
    return this.prisma.case.findMany({
      where: this.accessFilter(user),
      include: caseInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const record = await this.prisma.case.findFirst({
      where: { id, ...this.accessFilter(user) },
      include: caseInclude,
    });
    if (!record) {
      const exists = await this.prisma.case.findUnique({ where: { id }, select: { id: true } });
      if (exists) throw new ForbiddenException('You do not have access to this case');
      throw new NotFoundException('Case not found');
    }
    return record;
  }

  async create(dto: CreateCaseDto, user: AuthenticatedUser) {
    const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!department) throw new NotFoundException('Department does not exist');
    if (user.role !== 'ADMIN' && user.departmentId !== dto.departmentId) {
      throw new ForbiddenException('Cases can be created only in your department');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const record = await tx.case.create({
          data: {
            caseNumber: dto.caseNumber.toUpperCase(),
            title: dto.title.trim(),
            description: dto.description,
            departmentId: dto.departmentId,
            status: dto.status,
            createdById: user.id,
            members: { create: { userId: user.id, caseRole: 'OWNER' } },
          },
          include: caseInclude,
        });
        await this.audit.append({
          userId: user.id,
          action: 'CASE_CREATED',
          entityType: 'case',
          entityId: record.id,
          caseId: record.id,
          metadata: { caseNumber: record.caseNumber },
        }, tx);
        return record;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A case with this number already exists');
      }
      throw error;
    }
  }
}
