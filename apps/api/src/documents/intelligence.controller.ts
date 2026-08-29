import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthenticatedUser } from '../common/auth-user';
import { IntelligenceService } from './intelligence.service';
import { VersionQueryDto } from './dto/document-query.dto';

@ApiTags('intelligence') @ApiBearerAuth() @Controller('documents') @UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(private readonly intelligence: IntelligenceService) {}
  @Get(':id/intelligence') status(@Param('id', ParseUUIDPipe) id: string, @Query() query: VersionQueryDto, @CurrentUser() user: AuthenticatedUser) { return this.intelligence.status(id, user, query.versionId); }
  @Post(':id/process') process(@Param('id', ParseUUIDPipe) id: string, @Query() query: VersionQueryDto, @CurrentUser() user: AuthenticatedUser) { return this.intelligence.run(id, user, query.versionId); }
}
