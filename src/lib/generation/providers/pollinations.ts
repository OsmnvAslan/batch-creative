import type { GenerateInput, ImageProvider } from "@/lib/types";
import { ProviderError, parseRetryAfter } from "../retry";
import { fetchWithTimeout, stableSeed } from "./shared";

// Pollinations.ai — keyless text->image. Sees only the text prompt, so it is the
// fallback when no image-to-image provider is configured or all of them failed.
// Slow under load (18–46s observed), hence the generous timeout. The free tier
// answers 429 to concurrent requests from one address, so calls are serialised.
const TIMEOUT_MS = 90_000;
const SIZE = 768;
const CONCURRENCY = 1;

/**
 * GEN_FORCE_FAIL: comma-separated product names this provider refuses to generate.
 * Used to demonstrate partial failure + failover without real network errors.
 */
function forcedFailNames(env: Record<string, string | undefined>): Set<string> {
  return new Set(
    (env.GEN_FORCE_FAIL ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export class PollinationsProvider implements ImageProvider {
  readonly name = "pollinations";
  readonly kind = "text-to-image" as const;
  readonly concurrency = CONCURRENCY;

  async generate(input: GenerateInput): Promise<string> {
    if (forcedFailNames(process.env).has(input.product.name)) {
      throw new ProviderError(`forced failure via GEN_FORCE_FAIL for "${input.product.name}"`, {
        retryable: false,
      });
    }

    // Batch seed mixed with the prompt: reproducible per product, no collisions
    // between products whose descriptions differ.
    const seed = stableSeed(`${input.seed}::${input.stylePrompt}`);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(input.stylePrompt)}` +
      `?width=${SIZE}&height=${SIZE}&nologo=true&seed=${seed}`;

    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) {
      throw new ProviderError(`HTTP ${res.status}`, {
        status: res.status,
        retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
      });
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new ProviderError("empty response body", { retryable: true });

    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
}
