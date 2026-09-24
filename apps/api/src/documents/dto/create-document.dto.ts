import { ApiProperty } from '@nestjs/swagger';
import { DocumentClassification } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { DOCUMENT_TYPES } from '../document-policy';

export class CreateDocumentDto {
  @ApiProperty()
  @IsUUID()
  caseId: string;

  @ApiProperty({ example: 'Forensic report' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'REPORT' })
  @IsString()
  @IsIn(DOCUMENT_TYPES)
  documentType: string;

  @ApiProperty({ enum: DocumentClassification, default: DocumentClassification.RESTRICTED, required: false })
  @IsOptional()
  @IsEnum(DocumentClassification)
  classification?: DocumentClassification;
}
