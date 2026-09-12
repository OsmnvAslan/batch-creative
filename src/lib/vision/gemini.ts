import type { ImageBytes } from "@/lib/types";
import { LlmError, withLlmRetry, type VisionClient } from "./index";

export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3.5-flash-lite";
const TIMEOUT_MS = 45_000;

interface GeminiTextResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
}

export class GeminiVisionClient implements VisionClient {
  readonly name = "gemini";
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }) {
    this.model = opts.model || DEFAULT_GEMINI_TEXT_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  caption(instruction: string, images: ImageBytes[]): Promise<string> {
    const parts: Array<Record<string, unknown>> = [{ text: instruction }];
    for (const img of images) {
      parts.push({ inlineData: { mimeType: img.mime, data: img.bytes.toString("base64") } });
    }
    return withLlmRetry(() => this.call(parts));
  }

  complete(prompt: string): Promise<string> {
    return withLlmRetry(() => this.call([{ text: prompt }]));
  }

  private async call(parts: Array<Record<string, unknown>>): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
        {
          method: "POST",
          headers: { "x-goog-api-key": this.opts.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts }],
            generationConfig: { temperature: 0.4 },
          }),
          signal: controller.signal,
        },
      );
      const json = (await res.json().catch(() => ({}))) as GeminiTextResponse;
      if (!res.ok) {
        throw new LlmError(
          `Gemini HTTP ${res.status}${json.error?.message ? `: ${json.error.message}` : ""}`,
          res.status === 429 || res.status >= 500,
        );
      }
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (!text) throw new LlmError("Gemini returned empty content", true);
      return text;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new LlmError("Gemini timed out", true);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
