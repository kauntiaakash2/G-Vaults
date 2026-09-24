import { ApiPropertyOptional } from '@nestjs/swagger';
import { VersionKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateVersionDto {
  @ApiPropertyOptional({ example: 'Corrected page 3 findings' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;

  @ApiPropertyOptional({ enum: VersionKind, default: VersionKind.REVISION })
  @IsOptional()
  @IsEnum(VersionKind)
  versionKind?: VersionKind;

  @ApiPropertyOptional({ description: 'Required for DERIVED or REDACTED versions.' })
  @IsOptional()
  @IsUUID()
  sourceVersionId?: string;

  @ApiPropertyOptional({ example: 'REDACTION' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transformationType?: string;
}
