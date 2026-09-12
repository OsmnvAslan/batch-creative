import type { GenerateInput, ImageProvider } from "@/lib/types";
import { ProviderError } from "../retry";
import { fetchWithTimeout, stableSeed } from "./shared";

// Pollinations.ai — keyless text->image. Primary provider on the free path.
// Slow under load (18–46s observed), hence the generous timeout.
const TIMEOUT_MS = 90_000;
const SIZE = 768;

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

  async generate(input: GenerateInput): Promise<string> {
    if (forcedFailNames(process.env).has(input.productName)) {
      throw new ProviderError(
        `forced failure via GEN_FORCE_FAIL for "${input.productName}"`,
        { retryable: false },
      );
    }

    // Seed off name + full prompt so products with similar filenames but
    // different descriptions do not collide on the same image.
    const seed = stableSeed(`${input.productName}::${input.stylePrompt}`);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(input.stylePrompt)}` +
      `?width=${SIZE}&height=${SIZE}&nologo=true&seed=${seed}`;

    const res = await fetchWithTimeout(url, {}, TIMEOUT_MS);
    if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, { status: res.status });

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new ProviderError("empty response body", { retryable: true });

    const mime = res.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }
}
