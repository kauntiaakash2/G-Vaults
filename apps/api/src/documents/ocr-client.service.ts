import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type OcrWorkerResult = { document_version_id: string; text: string; page_count: number; engine: string; language?: string };

@Injectable()
export class OcrClientService {
  private readonly endpoint: string | undefined;
  private readonly internalToken: string | undefined;

  constructor(config: ConfigService) {
    this.endpoint = config.get<string>('OCR_SERVICE_URL')?.replace(/\/$/, '') || undefined;
    const configuredToken = config.get<string>('OCR_INTERNAL_TOKEN');
    const developmentDefault = config.get<string>('NODE_ENV', 'development') === 'development'
      ? 'local-only-ocr-token-change-me-26190'
      : undefined;
    this.internalToken = configuredToken || developmentDefault;
    if (this.endpoint && (!this.internalToken || this.internalToken.length < 32)) {
      throw new Error('OCR_INTERNAL_TOKEN must contain at least 32 characters when OCR_SERVICE_URL is configured');
    }
  }

  configured() { return Boolean(this.endpoint); }

  async process(documentVersionId: string, mimeType: string, bytes: Buffer): Promise<OcrWorkerResult> {
    if (!this.endpoint) throw new ServiceUnavailableException('OCR service is not configured');
    const response = await fetch(`${this.endpoint}/internal/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-OCR-Token': this.internalToken! },
      body: JSON.stringify({ document_version_id: documentVersionId, mime_type: mimeType, content_base64: bytes.toString('base64') }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new ServiceUnavailableException(`OCR service returned ${response.status}`);
    return response.json() as Promise<OcrWorkerResult>;
  }
}
