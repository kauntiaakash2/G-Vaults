import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecordStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class PlaceLegalHoldDto {
  @ApiProperty({ description: 'Document revision returned by the latest GET /documents/:id response', minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty({ example: 'Court review pending' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ example: 'ORDER-2026-014' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}

export class ReleaseLegalHoldDto {
  @ApiProperty({ description: 'Document revision returned by the latest GET /documents/:id response', minimum: 0 })
  @IsInt()
  @Min(0)
  expectedDocumentRevision: number;

  @ApiProperty({ description: 'Legal-hold revision returned by GET /documents/:id/holds', minimum: 0 })
  @IsInt()
  @Min(0)
  expectedHoldRevision: number;

  @ApiProperty({ example: 'Court review completed' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class ChangeRecordStatusDto {
  @ApiProperty({ description: 'Document revision returned by the latest GET /documents/:id response', minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty({ enum: RecordStatus })
  @IsEnum(RecordStatus)
  status: RecordStatus;

  @ApiProperty({ example: 'Approved for archival review' })
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}

export class RevokeAccessDto {
  @ApiProperty({ description: 'Permission-grant revision returned by GET /documents/:id/access', minimum: 0 })
  @IsInt()
  @Min(0)
  expectedRevision: number;

  @ApiProperty({ example: 'Review assignment completed' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
