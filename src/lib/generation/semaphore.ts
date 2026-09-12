// Counting semaphore, used to cap in-flight requests per provider. Free tiers
// (Pollinations in particular) reject concurrent requests from one address with
// 429, so the batch pool's parallelism must not translate 1:1 into provider calls.

export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error("Semaphore limit must be >= 1");
  }

  get inFlight(): number {
    return this.active;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active--;
    this.queue.shift()?.();
  }
}

/** Registry of one semaphore per provider name. */
export class SemaphoreRegistry {
  private readonly map = new Map<string, Semaphore>();

  for(name: string, limit: number): Semaphore {
    let s = this.map.get(name);
    if (!s || s.limit !== limit) {
      s = new Semaphore(limit);
      this.map.set(name, s);
    }
    return s;
  }
}

type GlobalWithSemaphores = typeof globalThis & { __batchCreativeSemaphores?: SemaphoreRegistry };

export function globalSemaphores(): SemaphoreRegistry {
  const g = globalThis as GlobalWithSemaphores;
  if (!g.__batchCreativeSemaphores) g.__batchCreativeSemaphores = new SemaphoreRegistry();
  return g.__batchCreativeSemaphores;
}
