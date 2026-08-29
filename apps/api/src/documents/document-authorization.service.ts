import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditResult, DocumentPermission } from '@prisma/client';
import type { AuthenticatedUser } from '../common/auth-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

const permissionImplications: Record<DocumentPermission, DocumentPermission[]> = {
  VIEW: ['VIEW', 'DOWNLOAD', 'EDIT', 'SHARE', 'APPROVE'],
  // Exporting evidence is a distinct capability. Editing, sharing, or
  // approving metadata must never silently grant permission to download the
  // underlying bytes.
  DOWNLOAD: ['DOWNLOAD'],
  EDIT: ['EDIT'],
  SHARE: ['SHARE'],
  APPROVE: ['APPROVE'],
};

@Injectable()
export class DocumentAuthorizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async authorize(documentId: string, user: AuthenticatedUser, permission: DocumentPermission) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        case: { select: { id: true, caseNumber: true, title: true, departmentId: true } },
        ownerDepartment: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        currentVersion: true,
        permissions: {
          where: {
            status: 'ACTIVE',
            permission: { in: permissionImplications[permission] },
            OR: [
              { userId: user.id },
              ...(user.departmentId ? [{ departmentId: user.departmentId }] : []),
            ],
          },
        },
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    const allowed =
      user.role === 'ADMIN' ||
      document.createdById === user.id ||
      (user.role === 'AUDITOR' && permission === 'VIEW') ||
      document.permissions.length > 0;
    if (!allowed) {
      await this.audit.append({
        userId: user.id,
        action: 'ACCESS_DENIED',
        entityType: 'document',
        entityId: document.id,
        caseId: document.caseId,
        documentId: document.id,
        result: AuditResult.DENIED,
        metadata: { requiredPermission: permission },
      });
      throw new ForbiddenException(`The ${permission} permission is required`);
    }
    return document;
  }

  capabilities(
    document: { createdById: string; permissions: { permission: DocumentPermission }[] },
    user: AuthenticatedUser,
  ) {
    const unrestricted = user.role === 'ADMIN' || document.createdById === user.id;
    const granted = new Set(document.permissions.map((item) => item.permission));
    return {
      view: unrestricted || user.role === 'AUDITOR' || granted.size > 0,
      download: unrestricted || granted.has(DocumentPermission.DOWNLOAD),
      edit: unrestricted || granted.has(DocumentPermission.EDIT),
      share: unrestricted || granted.has(DocumentPermission.SHARE),
      approve: unrestricted || granted.has(DocumentPermission.APPROVE),
    };
  }
}
