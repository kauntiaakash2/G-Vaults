import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { StorageService } from './storage.service';

@Injectable()
export class MinioStorageService extends StorageService implements OnModuleInit {
  private readonly client: Client;
  private readonly bucket: string;
  private readonly maxObjectBytes: number;

  constructor(config: ConfigService) {
    super();
    this.bucket = config.get<string>('MINIO_BUCKET', 'sih-documents');
    this.maxObjectBytes = Number(config.get('MAX_UPLOAD_BYTES', 20 * 1024 * 1024)) + 64;
    this.client = new Client({
      endPoint: config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(config.get('MINIO_PORT', 9000)),
      useSSL: config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: config.getOrThrow<string>('MINIO_ACCESS_KEY'),
      secretKey: config.getOrThrow<string>('MINIO_SECRET_KEY'),
    });
  }

  async onModuleInit() {
    if (!(await this.client.bucketExists(this.bucket))) await this.client.makeBucket(this.bucket);
  }

  async put(key: string, data: Buffer) {
    await this.client.putObject(this.bucket, key, data, data.length, {
      'Content-Type': 'application/octet-stream',
      'X-Amz-Meta-Encrypted': 'AES-256-GCM',
    });
  }

  async get(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      total += buffer.length;
      if (total > this.maxObjectBytes) {
        stream.destroy();
        throw new Error('Stored object exceeds the configured maximum size');
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'NotFound' || code === 'NoSuchKey') return false;
      throw error;
    }
  }

  async delete(key: string) {
    await this.client.removeObject(this.bucket, key);
  }
}
