import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentPermission } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

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
}
