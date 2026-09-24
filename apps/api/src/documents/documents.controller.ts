import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedUser } from '../common/auth-user';
import { CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { IdempotencyService } from '../common/idempotency.service';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateVersionDto } from './dto/create-version.dto';
import { DocumentListQueryDto, VersionQueryDto } from './dto/document-query.dto';
import { GrantAccessDto } from './dto/grant-access.dto';
import { RevokeAccessDto } from './dto/records.dto';

const fileSchema = { type: 'string', format: 'binary' };

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get()
  list(@Query() query: DocumentListQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.list(query.caseId, user);
  }

  @Get('security-stats')
  securityStats(@CurrentUser() user: AuthenticatedUser) {
    return this.documents.securityStats(user);
  }

  @Post()
  @Roles('INVESTIGATOR', 'SENIOR_OFFICER', 'DEPARTMENT_HEAD')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['caseId', 'title', 'documentType', 'file'],
      properties: { caseId: { type: 'string' }, title: { type: 'string' }, documentType: { type: 'string' }, classification: { type: 'string' }, file: fileSchema },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey,
      user.id,
      'documents:create',
      { dto, file: this.idempotency.fileFingerprint(file) },
      () => this.documents.create(dto, file, user, request.ip),
    );
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.get(id, user);
  }

  @Get(':id/download')
  @ApiProduces('application/octet-stream')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: VersionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.documents.download(id, query.versionId, user, request.ip);
    this.fileHeaders(response, result.version.originalFilename, result.version.mimeType, 'attachment');
    return new StreamableFile(result.bytes);
  }

  @Get(':id/content')
  async preview(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: VersionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.documents.preview(id, query.versionId, user, request.ip);
    this.fileHeaders(response, result.version.originalFilename, result.version.mimeType, 'inline');
    return new StreamableFile(result.bytes);
  }

  @Post(':id/versions')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { changeDescription: { type: 'string' }, file: fileSchema },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async createVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVersionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: Request,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey,
      user.id,
      `documents:${id}:versions`,
      { dto, file: this.idempotency.fileFingerprint(file) },
      () => this.documents.createVersion(id, dto, file, user, request.ip),
    );
  }

  @Get(':id/versions')
  versions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.versions(id, user);
  }

  @Get(':id/verify')
  verify(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: VersionQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.documents.verify(id, query.versionId, user);
  }

  @Get(':id/access')
  access(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.access(id, user);
  }

  @Post(':id/access')
  async grant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GrantAccessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey,
      user.id,
      `documents:${id}:access:grant`,
      dto,
      () => this.documents.grantAccess(id, dto, user),
    );
  }

  @Delete(':id/access/:permissionId')
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('permissionId', ParseUUIDPipe) permissionId: string,
    @Body() dto: RevokeAccessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.idempotency.execute(
      idempotencyKey,
      user.id,
      `documents:${id}:access:${permissionId}:revoke`,
      dto,
      () => this.documents.revokeAccess(id, permissionId, dto, user),
    );
  }

  @Get(':id/audit')
  audit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documents.auditTrail(id, user);
  }

  private fileHeaders(response: Response, filename: string, mimeType: string, disposition: 'inline' | 'attachment') {
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `${disposition}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
}
