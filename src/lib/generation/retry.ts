// Retry with exponential backoff + jitter.
//
// Only *retryable* failures are retried: timeouts, network errors, HTTP 408/425/429
// and 5xx. A 4xx (bad prompt, missing key, forced test failure) fails fast so the
// caller can fail over to the next provider instead of burning the backoff budget.
// A 429 waits at least a few seconds (or Retry-After) instead of the normal backoff.

export interface RetryOptions {
  retries: number; // retries after the first try; total tries = retries + 1
  baseMs: number; // base backoff; delay before retry N = base * 2^(N-1) + jitter
  onAttempt?: () => void; // called before every attempt (used to tally attempts)
  sleep?: (ms: number) => Promise<void>; // injectable for tests
  random?: () => number; // injectable for tests
}

/**
 * Error thrown by providers. `retryable` tells the retry loop whether another
 * attempt against the same provider is worth it.
 */
export class ProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  /** Minimum wait before the next attempt (e.g. from a Retry-After header). */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    opts: { status?: number; retryable?: boolean; retryAfterMs?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.status = opts.status;
    this.retryable = opts.retryable ?? (opts.status === undefined ? true : isRetryableStatus(opts.status));
    this.retryAfterMs = opts.retryAfterMs;
  }
}

/** Parse a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Rate limits deserve a longer pause than a generic blip. */
const RATE_LIMIT_MIN_MS = 3_000;
const MAX_WAIT_MS = 30_000;

export function retryDelay(err: unknown, attempt: number, baseMs: number, random: () => number): number {
  const backoff = baseMs * 2 ** (attempt - 1) + random() * baseMs;
  if (err instanceof ProviderError) {
    const floor = err.status === 429 ? RATE_LIMIT_MIN_MS : 0;
    return Math.min(MAX_WAIT_MS, Math.max(backoff, floor, err.retryAfterMs ?? 0));
  }
  return Math.min(MAX_WAIT_MS, backoff);
}

export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Classify any thrown value. Unknown errors are treated as transient. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof ProviderError) return err.retryable;
  if (err instanceof Error) {
    // fetch() abort (our timeout) or a socket-level failure.
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    if (err.name === "TypeError" && /fetch failed/i.test(err.message)) return true;
  }
  return true;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  const totalTries = Math.max(1, opts.retries + 1);
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= totalTries; attempt++) {
    opts.onAttempt?.();
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === totalTries) break;
      await sleep(retryDelay(err, attempt, opts.baseMs, random));
    }
  }

  throw lastErr;
}
