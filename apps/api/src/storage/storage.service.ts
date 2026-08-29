export abstract class StorageService {
  abstract put(key: string, data: Buffer): Promise<void>;
  abstract get(key: string): Promise<Buffer>;
  abstract exists(key: string): Promise<boolean>;
  abstract delete(key: string): Promise<void>;
}
