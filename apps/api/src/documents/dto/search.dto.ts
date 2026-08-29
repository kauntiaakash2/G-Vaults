import { IsDateString, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SearchDto {
  @IsString() @MinLength(1) @MaxLength(200) q!: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() documentType?: string;
  @IsOptional() @IsDateString() createdFrom?: string;
  @IsOptional() @IsDateString() createdTo?: string;
}
