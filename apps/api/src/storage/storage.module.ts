import { Global, Module } from '@nestjs/common';
import { MinioStorageService } from './minio-storage.service';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [MinioStorageService, { provide: StorageService, useExisting: MinioStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
