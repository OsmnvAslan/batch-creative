import type { GenerateInput, GenerateResult, ImageProvider } from "@/lib/types";
import { withBackoff } from "./retry";
import { CircuitBreaker, globalBreaker } from "./breaker";
import { SemaphoreRegistry, globalSemaphores } from "./semaphore";
import { GeminiImageProvider } from "./providers/gemini";
import { PollinationsProvider } from "./providers/pollinations";
import { TogetherProvider } from "./providers/together";
import { MockProvider } from "./providers/mock";

// Ordered provider chain with per-provider retries, failover and a circuit breaker.
//
//   for each provider in order:
//     skip if its circuit is open
//     try up to (1 + RETRIES) times with exponential backoff (retryable errors only),
//       each call holding a slot in the provider's concurrency semaphore
//     on exhaustion -> record a breaker failure, move to the next provider
//   if every provider fails -> GenerationError
//
// `attempts` is aggregated across all providers so the UI can show how hard a
// result was to obtain (e.g. "4 tries" = 3 on the primary + 1 on the failover).

const RETRIES = 2;
const BASE_MS = 800;

export class GenerationError extends Error {
  readonly failures: string[];
  constructor(message: string, failures: string[]) {
    super(message);
    this.name = "GenerationError";
    this.failures = failures;
  }
}

/**
 * Provider chain from the environment, best first:
 *   gemini (image-to-image, if GEMINI_API_KEY)
 *   -> pollinations (keyless text-to-image)
 *   -> together (text-to-image, if TOGETHER_API_KEY)
 *   -> mock (offline placeholder, if ENABLE_MOCK_PROVIDER)
 *
 * The mock provider is opt-in so that, by default, a product whose real providers
 * all fail is reported as *failed* rather than silently replaced by a placeholder.
 */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): ImageProvider[] {
  const providers: ImageProvider[] = [];
  if (env.GEMINI_API_KEY) {
    providers.push(new GeminiImageProvider({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_IMAGE_MODEL }));
  }
  providers.push(new PollinationsProvider());
  if (env.TOGETHER_API_KEY) providers.push(new TogetherProvider(env.TOGETHER_API_KEY));
  if (env.ENABLE_MOCK_PROVIDER === "true" || env.ENABLE_MOCK_PROVIDER === "1") {
    providers.push(new MockProvider());
  }
  return providers;
}

export interface GenerateOptions {
  providers?: ImageProvider[];
  breaker?: CircuitBreaker;
  semaphores?: SemaphoreRegistry;
  retries?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function generatePost(
  input: GenerateInput,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const providers = opts.providers ?? providersFromEnv();
  const breaker = opts.breaker ?? globalBreaker();
  const semaphores = opts.semaphores ?? globalSemaphores();
  if (providers.length === 0) {
    throw new GenerationError("No image providers configured", []);
  }

  let attempts = 0;
  const failures: string[] = [];

  for (const provider of providers) {
    if (!breaker.allows(provider.name)) {
      failures.push(`${provider.name}: skipped (circuit open)`);
      continue;
    }
    const call = provider.concurrency
      ? () => semaphores.for(provider.name, provider.concurrency!).run(() => provider.generate(input))
      : () => provider.generate(input);
    try {
      const imageDataUrl = await withBackoff(call, {
        retries: opts.retries ?? RETRIES,
        baseMs: opts.baseMs ?? BASE_MS,
        sleep: opts.sleep,
        onAttempt: () => {
          attempts++;
        },
      });
      breaker.recordSuccess(provider.name);
      return {
        imageDataUrl,
        provider: provider.name,
        imageConditioned: provider.kind === "image-to-image",
        attempts,
      };
    } catch (err) {
      breaker.recordFailure(provider.name);
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${provider.name}: ${msg}`);
    }
  }

  throw new GenerationError(`All providers failed after ${attempts} attempt(s)`, failures);
}
