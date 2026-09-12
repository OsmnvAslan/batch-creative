import { ProviderError } from "../retry";

/** Stable non-negative 32-bit hash of a string (used as a generation seed). */
export function stableSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * fetch() with an abort timeout. A timeout surfaces as a retryable ProviderError
 * so the retry loop treats it as transient.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError(`timed out after ${timeoutMs}ms`, { retryable: true, cause: err });
    }
    throw new ProviderError(
      err instanceof Error ? err.message : String(err),
      { retryable: true, cause: err },
    );
  } finally {
    clearTimeout(timer);
  }
}
