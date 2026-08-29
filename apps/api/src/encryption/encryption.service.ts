import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const MAGIC = Buffer.from('SIH1');
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const configured = config.get<string>('ENCRYPTION_KEY') ?? '';
    if (/^[0-9a-fA-F]{64}$/.test(configured)) {
      this.key = Buffer.from(configured, 'hex');
    } else if (configured.startsWith('base64:')) {
      this.key = Buffer.from(configured.slice(7), 'base64');
    } else {
      throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters or base64:<32-byte-key>');
    }
    if (this.key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  encrypt(data: Buffer, context: string): Buffer {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), ciphertext]);
  }

  decrypt(payload: Buffer, context: string): Buffer {
    if (payload.length < MAGIC.length + IV_LENGTH + TAG_LENGTH || !payload.subarray(0, 4).equals(MAGIC)) {
      throw new Error('Encrypted object has an invalid envelope');
    }
    const ivStart = MAGIC.length;
    const tagStart = ivStart + IV_LENGTH;
    const dataStart = tagStart + TAG_LENGTH;
    const decipher = createDecipheriv('aes-256-gcm', this.key, payload.subarray(ivStart, tagStart));
    decipher.setAAD(Buffer.from(context, 'utf8'));
    decipher.setAuthTag(payload.subarray(tagStart, dataStart));
    return Buffer.concat([decipher.update(payload.subarray(dataStart)), decipher.final()]);
  }
}
