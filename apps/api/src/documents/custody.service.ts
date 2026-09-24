import { Injectable } from '@nestjs/common';
import { CustodyEventCategory, CustodyEventType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type CustodyWriter = Pick<PrismaService, 'custodyEvent'> | Prisma.TransactionClient;

export type CustodyEventInput = {
  category: CustodyEventCategory;
  type: CustodyEventType;
  caseId: string;
  documentId?: string;
  versionId?: string;
  actorId?: string;
  details?: Prisma.InputJsonValue;
};

@Injectable()
export class CustodyService {
  constructor(private readonly prisma: PrismaService) {}

  append(input: CustodyEventInput, writer: CustodyWriter = this.prisma) {
    return writer.custodyEvent.create({
      data: {
        category: input.category,
        type: input.type,
        caseId: input.caseId,
        documentId: input.documentId,
        versionId: input.versionId,
        actorId: input.actorId,
        details: input.details,
      },
    });
  }
}
