import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVersionDto {
  @ApiPropertyOptional({ example: 'Corrected page 3 findings' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changeDescription?: string;
}
