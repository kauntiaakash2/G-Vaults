import { MiddlewareConsumer, Module, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { CasesModule } from './cases/cases.module';
import { DepartmentsModule } from './departments/departments.module';
import { DocumentsModule } from './documents/documents.module';
import { EncryptionModule } from './encryption/encryption.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { StorageModule } from './storage/storage.module';
import { SearchController } from './search.controller';
import { RateLimitMiddleware } from './common/rate-limit.middleware';

@Module({
  controllers: [SearchController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    PrismaModule,
    AuditModule,
    EncryptionModule,
    StorageModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    CasesModule,
    DocumentsModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RateLimitMiddleware).forRoutes(
      { path: 'auth/login', method: RequestMethod.POST },
      { path: 'search', method: RequestMethod.GET },
      { path: 'documents/:id/download', method: RequestMethod.GET },
      { path: 'documents/:id/content', method: RequestMethod.GET },
    );
  }
}
