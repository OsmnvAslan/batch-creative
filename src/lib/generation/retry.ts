// Retry with exponential backoff + jitter.
//
// Only *retryable* failures are retried: timeouts, network errors, HTTP 408/425/429
// and 5xx. A 4xx (bad prompt, missing key, forced test failure) fails fast so the
// caller can fail over to the next provider instead of burning the backoff budget.

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

  constructor(
    message: string,
    opts: { status?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "ProviderError";
    this.status = opts.status;
    this.retryable = opts.retryable ?? (opts.status === undefined ? true : isRetryableStatus(opts.status));
  }
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
      const backoff = opts.baseMs * 2 ** (attempt - 1);
      const jitter = random() * opts.baseMs;
      await sleep(backoff + jitter);
    }
  }

  throw lastErr;
}
