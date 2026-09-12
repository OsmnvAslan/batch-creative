import type { GenerateInput, ImageProvider } from "@/lib/types";
import { ProviderError, parseRetryAfter } from "../retry";
import { fetchWithTimeout } from "./shared";

// Gemini image model (image-to-image). The primary provider whenever a key is
// present: it sees the real product pixels and the real reference pixels, so
// the output is *this* product in *that* style rather than a text paraphrase.
//
// REST: POST v1beta/models/{model}:generateContent with inlineData parts and
// responseModalities ["IMAGE"]. Docs: https://ai.google.dev/gemini-api/docs/image-generation

export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const TIMEOUT_MS = 120_000;

export interface GeminiImageOptions {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
}

export function buildGeminiImagePrompt(input: GenerateInput): string {
  const refs = input.references.length === 1 ? "the reference image" : "the reference images";
  return [
    `You are producing one square social-media product post.`,
    `The first ${input.references.length === 1 ? "image is" : `${input.references.length} images are`} STYLE REFERENCES: copy their colour palette, lighting, mood, composition, surfaces and lens feel. Do not copy any object from them.`,
    `The last image is the PRODUCT: keep its exact shape, proportions, colours, materials, labels and branding. It is ${input.productDescription}.`,
    `Render the product as the hero of a new scene in the style of ${refs}.`,
    `Shared style description for the whole series: ${input.styleFingerprint}`,
    `No text, captions, watermarks or logos other than those on the product itself.`,
  ].join("\n");
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";
  readonly kind = "image-to-image" as const;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GeminiImageOptions) {
    this.model = opts.model || DEFAULT_GEMINI_IMAGE_MODEL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async generate(input: GenerateInput): Promise<string> {
    const parts: Array<Record<string, unknown>> = [{ text: buildGeminiImagePrompt(input) }];
    for (const ref of input.references) {
      parts.push({ inlineData: { mimeType: ref.mime, data: ref.bytes.toString("base64") } });
    }
    parts.push({
      inlineData: { mimeType: input.product.mime, data: input.product.bytes.toString("base64") },
    });

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "x-goog-api-key": this.opts.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
            seed: input.seed,
          },
        }),
      },
      TIMEOUT_MS,
      this.fetchImpl,
    );

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw new ProviderError(`HTTP ${res.status}${json.error?.message ? `: ${json.error.message}` : ""}`, {
        status: res.status,
        retryAfterMs: parseRetryAfter(res.headers.get("retry-after")),
      });
    }

    const blocked = json.promptFeedback?.blockReason;
    if (blocked) throw new ProviderError(`blocked: ${blocked}`, { retryable: false });

    const candidate = json.candidates?.[0];
    const image = candidate?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!image?.data) {
      const reason = candidate?.finishReason ?? "no image part in response";
      // SAFETY / RECITATION are deterministic; anything else may be a transient hiccup.
      const retryable = !/SAFETY|RECITATION|PROHIBITED/i.test(reason);
      throw new ProviderError(`no image returned (${reason})`, { retryable });
    }
    return `data:${image.mimeType || "image/png"};base64,${image.data}`;
  }
}
