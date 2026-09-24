import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentPermission } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class GrantAccessDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ enum: DocumentPermission })
  @IsEnum(DocumentPermission)
  permission: DocumentPermission;

  @ApiPropertyOptional({ example: 'Required for cross-department forensic review' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 activation time. Defaults to now.' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ description: 'ISO-8601 expiry time.' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
