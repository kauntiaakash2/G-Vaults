import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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
  @MinLength(2)
  @MaxLength(50)
  documentType: string;
}
