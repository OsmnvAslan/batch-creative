// Fixed-window rate limiter keyed by client IP, for POST /api/batch.
// In-memory and per-process, which matches the single-process deployment.

export interface RateLimitOptions {
  limit?: number; // requests per window (default 10)
  windowMs?: number; // window length (default 10 min)
  now?: () => number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, { count: number; windowStart: number }>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(opts: RateLimitOptions = {}) {
    this.limit = opts.limit ?? 10;
    this.windowMs = opts.windowMs ?? 10 * 60 * 1000;
    this.now = opts.now ?? Date.now;
  }

  check(key: string): RateLimitResult {
    const t = this.now();
    let entry = this.hits.get(key);
    if (!entry || t - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: t };
      this.hits.set(key, entry);
    }
    if (entry.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterMs: entry.windowStart + this.windowMs - t };
    }
    entry.count += 1;
    if (this.hits.size > 10_000) this.sweep(t);
    return { allowed: true, remaining: this.limit - entry.count, retryAfterMs: 0 };
  }

  private sweep(t: number): void {
    for (const [key, entry] of this.hits) {
      if (t - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

type GlobalWithLimiter = typeof globalThis & { __batchCreativeLimiter?: RateLimiter };

export function globalLimiter(env: Record<string, string | undefined> = process.env): RateLimiter {
  const g = globalThis as GlobalWithLimiter;
  if (!g.__batchCreativeLimiter) {
    const limit = Number(env.RATE_LIMIT_BATCHES);
    const windowMs = Number(env.RATE_LIMIT_WINDOW_MS);
    g.__batchCreativeLimiter = new RateLimiter({
      limit: Number.isInteger(limit) && limit > 0 ? limit : undefined,
      windowMs: Number.isInteger(windowMs) && windowMs > 0 ? windowMs : undefined,
    });
  }
  return g.__batchCreativeLimiter;
}
