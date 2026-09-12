// Vision / text LLM client used by the style module for captioning references,
// describing products and writing social copy.
//
// Selection: GEMINI_API_KEY -> Gemini; else OPENROUTER_API_KEY -> OpenRouter;
// else undefined (callers fall back to deterministic text).

import type { ImageBytes } from "@/lib/types";
import { GeminiVisionClient } from "./gemini";
import { OpenRouterVisionClient } from "./openrouter";

export interface VisionClient {
  readonly name: string;
  /** One instruction + one or more images -> the model's text reply (trimmed). */
  caption(instruction: string, images: ImageBytes[]): Promise<string>;
  /** Text-only completion. */
  complete(prompt: string): Promise<string>;
}

export function visionClientFromEnv(
  env: Record<string, string | undefined> = process.env,
): VisionClient | undefined {
  if (env.GEMINI_API_KEY) {
    return new GeminiVisionClient({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_TEXT_MODEL });
  }
  if (env.OPENROUTER_API_KEY?.trim()) {
    return new OpenRouterVisionClient({
      apiKey: env.OPENROUTER_API_KEY.trim(),
      model: env.OPENROUTER_VISION_MODEL,
    });
  }
  return undefined;
}

/**
 * Retry helper shared by the clients: free/cheap LLM endpoints are flaky
 * (429, idle timeouts). Retries only when the error is not flagged non-retryable.
 */
export async function withLlmRetry<T>(
  fn: () => Promise<T>,
  { tries = 3, baseMs = 1_200, sleep = defaultSleep } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const retryable = (err as { retryable?: boolean } | null)?.retryable !== false;
      if (!retryable || attempt === tries) break;
      await sleep(baseMs * attempt);
    }
  }
  throw lastErr;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class LlmError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "LlmError";
    this.retryable = retryable;
  }
}
