// Per-provider circuit breaker.
//
// closed  -> normal operation; consecutive failures are counted
// open    -> provider is skipped until `cooldownMs` has passed
// half-open (implicit) -> after the cooldown one call is allowed through;
//            success closes the circuit, failure re-opens it
//
// This stops a provider that is down from adding its full retry/backoff budget
// to every single product in a batch.

export interface BreakerOptions {
  failureThreshold?: number; // consecutive failures before opening (default 3)
  cooldownMs?: number; // how long to stay open (default 60s)
  now?: () => number;
}

interface State {
  failures: number;
  openedAt?: number;
}

export class CircuitBreaker {
  private readonly states = new Map<string, State>();
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(opts: BreakerOptions = {}) {
    this.threshold = opts.failureThreshold ?? 3;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
    this.now = opts.now ?? Date.now;
  }

  /** True when the provider may be called right now. */
  allows(name: string): boolean {
    const s = this.states.get(name);
    if (!s || s.openedAt === undefined) return true;
    if (this.now() - s.openedAt >= this.cooldownMs) {
      // Half-open: let one call through; leave openedAt so a failure re-opens.
      s.openedAt = undefined;
      s.failures = this.threshold - 1;
      return true;
    }
    return false;
  }

  isOpen(name: string): boolean {
    return !this.allows(name);
  }

  recordSuccess(name: string): void {
    this.states.delete(name);
  }

  recordFailure(name: string): void {
    const s = this.states.get(name) ?? { failures: 0 };
    s.failures += 1;
    if (s.failures >= this.threshold) s.openedAt = this.now();
    this.states.set(name, s);
  }

  /** Snapshot for diagnostics. */
  snapshot(): Record<string, { failures: number; open: boolean }> {
    const out: Record<string, { failures: number; open: boolean }> = {};
    for (const [name, s] of this.states) {
      out[name] = { failures: s.failures, open: s.openedAt !== undefined && !this.cooledDown(s) };
    }
    return out;
  }

  private cooledDown(s: State): boolean {
    return s.openedAt !== undefined && this.now() - s.openedAt >= this.cooldownMs;
  }
}

type GlobalWithBreaker = typeof globalThis & { __batchCreativeBreaker?: CircuitBreaker };

/** Process-wide breaker shared by every batch. */
export function globalBreaker(): CircuitBreaker {
  const g = globalThis as GlobalWithBreaker;
  if (!g.__batchCreativeBreaker) g.__batchCreativeBreaker = new CircuitBreaker();
  return g.__batchCreativeBreaker;
}
