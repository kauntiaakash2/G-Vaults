import { IsOptional, IsUUID } from 'class-validator';

export class DocumentListQueryDto {
  @IsUUID()
  caseId: string;
}

export class VersionQueryDto {
  @IsOptional()
  @IsUUID()
  versionId?: string;
}
