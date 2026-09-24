const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
export const TOKEN_KEY = 'sih_access_token';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const method = (options.method ?? 'GET').toUpperCase();
  const mutatesState = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(!isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(mutatesState && typeof crypto !== 'undefined' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    throw new ApiError(response.status, message ?? `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function apiBlob(path: string): Promise<{ blob: Blob; filename: string }> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(response.status, body.message ?? `Request failed (${response.status})`);
  }
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1];
  return {
    blob: await response.blob(),
    filename: encoded ? decodeURIComponent(encoded) : 'document',
  };
}
