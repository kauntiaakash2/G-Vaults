import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuditResult } from '@prisma/client';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: LoginDto, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { role: true, department: true },
    });
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      await this.audit.append({
        userId: user?.id,
        action: 'LOGIN_FAILURE',
        entityType: 'authentication',
        entityId: dto.email.toLowerCase(),
        result: AuditResult.DENIED,
        ipAddress,
        metadata: { reason: 'INVALID_CREDENTIALS' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') {
      await this.audit.append({
        userId: user.id,
        action: 'LOGIN_FAILURE',
        entityType: 'authentication',
        entityId: user.id,
        result: AuditResult.DENIED,
        ipAddress,
        metadata: { reason: 'INACTIVE_USER' },
      });
      throw new UnauthorizedException('User is inactive');
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role.code,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
    };
    const response = {
      accessToken: await this.jwt.signAsync({ sub: user.id, type: 'access' }),
      user: safeUser,
    };
    await this.audit.append({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'authentication',
      entityId: user.id,
      ipAddress,
      metadata: { role: user.role.code },
    });
    return response;
  }
}
