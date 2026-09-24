import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { RolesGuard } from '../common/roles.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { ChangeRecordStatusDto, PlaceLegalHoldDto, ReleaseLegalHoldDto } from './dto/records.dto';
import { RecordsService } from './records.service';

@ApiTags('records')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RecordsController {
  constructor(
    private readonly records: RecordsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get(':id/provenance')
  provenance(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.records.provenance(id, user);
  }

  @Get(':id/holds')
  holds(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.records.holds(id, user);
  }

  @Post(':id/holds')
  async placeHold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlaceLegalHoldDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey, user.id, `documents:${id}:holds:place`, dto,
      () => this.records.placeHold(id, dto, user),
    );
  }

  @Post(':id/holds/:holdId/release')
  async releaseHold(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('holdId', ParseUUIDPipe) holdId: string,
    @Body() dto: ReleaseLegalHoldDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey, user.id, `documents:${id}:holds:${holdId}:release`, dto,
      () => this.records.releaseHold(id, holdId, dto, user),
    );
  }

  @Post(':id/record-status')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRecordStatusDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey, user.id, `documents:${id}:record-status`, dto,
      () => this.records.changeStatus(id, dto, user),
    );
  }
}
