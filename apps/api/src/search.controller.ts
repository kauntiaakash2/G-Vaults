import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './common/current-user.decorator';
import type { AuthenticatedUser } from './common/auth-user';
import { SearchDto } from './documents/dto/search.dto';
import { SearchService } from './documents/intelligence.service';

@ApiTags('search') @ApiBearerAuth() @Controller('search') @UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}
  @Get() searchDocuments(@Query() dto: SearchDto, @CurrentUser() user: AuthenticatedUser) {
    return this.search.search({ ...dto, createdFrom: dto.createdFrom ? new Date(dto.createdFrom) : undefined, createdTo: dto.createdTo ? new Date(dto.createdTo) : undefined }, user);
  }
}
