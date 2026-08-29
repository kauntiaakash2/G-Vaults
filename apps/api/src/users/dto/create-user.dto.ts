import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'Investigator A' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'investigator.a@sih.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 12, example: 'ChangeMe123!' })
  @IsString()
  @MinLength(12)
  password: string;

  @ApiProperty({ example: 'INVESTIGATOR' })
  @IsString()
  roleCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: UserStatus, default: UserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
