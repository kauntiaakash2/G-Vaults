import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };

export class RateLimitMiddleware {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs = 60_000;
  private readonly limits: Array<{ prefix: string; max: number }> = [
    { prefix: '/api/auth/login', max: 10 },
    { prefix: '/api/search', max: 60 },
    { prefix: '/api/documents/', max: 120 },
  ];

  use(request: Request, response: Response, next: NextFunction) {
    const rule = this.limits.find((item) => request.path.startsWith(item.prefix) && (item.prefix !== '/api/documents/' || request.path.endsWith('/download') || request.path.endsWith('/content')));
    if (!rule) return next();
    const key = `${request.ip}:${request.path}`;
    const now = Date.now();
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : existing;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    response.setHeader('X-RateLimit-Limit', rule.max);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, rule.max - bucket.count));
    if (bucket.count > rule.max) {
      response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return response.status(429).json({ statusCode: 429, message: 'Too many requests' });
    }
    return next();
  }
}
