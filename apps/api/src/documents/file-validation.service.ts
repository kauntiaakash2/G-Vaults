import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUtf8 } from 'node:buffer';
import path from 'node:path';

type AllowedType = { mimeTypes: string[]; signature?: (buffer: Buffer) => boolean };

const allowed: Record<string, AllowedType> = {
  '.pdf': { mimeTypes: ['application/pdf'], signature: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  '.png': { mimeTypes: ['image/png'], signature: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  '.jpg': { mimeTypes: ['image/jpeg'], signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  '.jpeg': { mimeTypes: ['image/jpeg'], signature: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  '.webp': { mimeTypes: ['image/webp'], signature: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  '.docx': { mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], signature: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
  '.txt': { mimeTypes: ['text/plain'], signature: (b) => isUtf8(b) && !b.includes(0) },
  '.md': { mimeTypes: ['text/markdown', 'text/plain'], signature: (b) => isUtf8(b) && !b.includes(0) },
};

export type ValidatedFile = {
  bytes: Buffer;
  originalFilename: string;
  mimeType: string;
  size: number;
};

@Injectable()
export class FileValidationService {
  private readonly maxBytes: number;

  constructor(config: ConfigService) {
    this.maxBytes = Number(config.get('MAX_UPLOAD_BYTES', 20 * 1024 * 1024));
  }

  validate(file?: Express.Multer.File): ValidatedFile {
    if (!file) throw new BadRequestException('A file is required');
    if (!file.buffer?.length) throw new BadRequestException('The uploaded file is empty');
    if (file.size > this.maxBytes) throw new PayloadTooLargeException(`Maximum file size is ${this.maxBytes} bytes`);

    const originalFilename = this.sanitizeFilename(file.originalname);
    const extension = path.extname(originalFilename).toLowerCase();
    const definition = allowed[extension];
    if (!definition) throw new BadRequestException(`Files with the ${extension || 'missing'} extension are not allowed`);
    if (!definition.mimeTypes.includes(file.mimetype.toLowerCase())) {
      throw new BadRequestException('The supplied MIME type does not match the file extension');
    }
    if (definition.signature && !definition.signature(file.buffer)) {
      throw new BadRequestException('The file signature does not match its declared type');
    }
    return { bytes: file.buffer, originalFilename, mimeType: file.mimetype.toLowerCase(), size: file.size };
  }

  private sanitizeFilename(input: string): string {
    const basename = path.basename(input.replaceAll('\\', '/'));
    const safe = basename
      .normalize('NFKC')
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[^a-zA-Z0-9._ ()-]/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 255);
    if (!safe || safe === '.' || safe === '..') throw new BadRequestException('The filename is invalid');
    return safe;
  }
}
