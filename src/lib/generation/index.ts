import type { GenerateInput, GenerateResult, ImageProvider } from "@/lib/types";
import { withBackoff } from "./retry";
import { PollinationsProvider } from "./providers/pollinations";
import { TogetherProvider } from "./providers/together";
import { MockProvider } from "./providers/mock";

// Ordered provider chain with per-provider retries and failover.
//
//   for each provider in order:
//     try up to (1 + RETRIES) times with exponential backoff (retryable errors only)
//     on exhaustion -> next provider
//   if every provider fails -> GenerationError
//
// `attempts` is aggregated across all providers so the UI can show how hard a
// result was to obtain (e.g. "4 tries" = 3 on the primary + 1 on the failover).

const RETRIES = 2;
const BASE_MS = 400;

export class GenerationError extends Error {
  readonly failures: string[];
  constructor(message: string, failures: string[]) {
    super(message);
    this.name = "GenerationError";
    this.failures = failures;
  }
}

/**
 * Provider chain from the environment:
 *   pollinations (keyless) -> together (if TOGETHER_API_KEY) -> mock (if ENABLE_MOCK_PROVIDER)
 *
 * The mock provider is opt-in so that, by default, a product whose real providers
 * all fail is reported as *failed* rather than silently replaced by a placeholder.
 */
export function providersFromEnv(env: Record<string, string | undefined> = process.env): ImageProvider[] {
  const providers: ImageProvider[] = [new PollinationsProvider()];
  if (env.TOGETHER_API_KEY) providers.push(new TogetherProvider(env.TOGETHER_API_KEY));
  if (env.ENABLE_MOCK_PROVIDER === "true" || env.ENABLE_MOCK_PROVIDER === "1") {
    providers.push(new MockProvider());
  }
  return providers;
}

export interface GenerateOptions {
  providers?: ImageProvider[];
  retries?: number;
  baseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export async function generatePost(
  input: GenerateInput,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const providers = opts.providers ?? providersFromEnv();
  if (providers.length === 0) {
    throw new GenerationError("No image providers configured", []);
  }

  let attempts = 0;
  const failures: string[] = [];

  for (const provider of providers) {
    try {
      const imageDataUrl = await withBackoff(() => provider.generate(input), {
        retries: opts.retries ?? RETRIES,
        baseMs: opts.baseMs ?? BASE_MS,
        sleep: opts.sleep,
        onAttempt: () => {
          attempts++;
        },
      });
      return { imageDataUrl, provider: provider.name, attempts };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${provider.name}: ${msg}`);
    }
  }

  throw new GenerationError(
    `All providers failed after ${attempts} attempt(s)`,
    failures,
  );
}
