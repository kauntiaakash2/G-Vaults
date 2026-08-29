import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateDepartmentDto) {
    try {
      return await this.prisma.department.create({
        data: { ...dto, name: dto.name.trim(), code: dto.code.toUpperCase() },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('A department with this code already exists');
      }
      throw error;
    }
  }
}
