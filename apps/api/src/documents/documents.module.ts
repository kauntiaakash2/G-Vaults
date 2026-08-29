import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthModule } from '../auth/auth.module';
import { CasesModule } from '../cases/cases.module';
import { RolesGuard } from '../common/roles.guard';
import { DocumentAuthorizationService } from './document-authorization.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { IntelligenceController } from './intelligence.controller';
import { IntelligenceService, SearchService } from './intelligence.service';
import { OcrClientService } from './ocr-client.service';
import { FileValidationService } from './file-validation.service';

@Module({
  imports: [
    AuthModule,
    CasesModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: memoryStorage(),
        limits: { fileSize: Number(config.get('MAX_UPLOAD_BYTES', 20 * 1024 * 1024)), files: 1, fields: 5 },
      }),
    }),
  ],
  controllers: [DocumentsController, IntelligenceController],
  providers: [DocumentsService, DocumentAuthorizationService, FileValidationService, IntelligenceService, SearchService, OcrClientService, RolesGuard],
  exports: [IntelligenceService, SearchService],
})
export class DocumentsModule {}
