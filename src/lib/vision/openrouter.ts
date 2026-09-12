import type { ImageBytes } from "@/lib/types";
import { LlmError, withLlmRetry, type VisionClient } from "./index";

// OpenRouter chat-completions client. Default model is a free vision-capable
// tier; free endpoints are rate-limited and flaky, hence the retries.
export const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-nano-12b-v2-vl:free";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 45_000;

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export class OpenRouterVisionClient implements VisionClient {
  readonly name = "openrouter";
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: { apiKey: string; model?: string; fetchImpl?: typeof fetch }) {
    this.model = opts.model || DEFAULT_OPENROUTER_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  caption(instruction: string, images: ImageBytes[]): Promise<string> {
    const content: Part[] = [{ type: "text", text: instruction }];
    for (const img of images) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mime};base64,${img.bytes.toString("base64")}` },
      });
    }
    return withLlmRetry(() => this.call(content));
  }

  complete(prompt: string): Promise<string> {
    return withLlmRetry(() => this.call([{ type: "text", text: prompt }]));
  }

  private async call(content: Part[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, messages: [{ role: "user", content }] }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new LlmError(`OpenRouter HTTP ${res.status}`, res.status === 429 || res.status >= 500);
      }
      const text = extractText(await res.json());
      if (!text) throw new LlmError("OpenRouter returned empty content", true);
      return text.trim();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw new LlmError("OpenRouter timed out", true);
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function extractText(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "object" && p !== null && "text" in p ? String((p as { text?: unknown }).text ?? "") : ""))
      .join(" ")
      .trim();
  }
  return undefined;
}
