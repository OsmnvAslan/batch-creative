import { describe, expect, it, vi } from "vitest";
import type { GenerateInput } from "@/lib/types";
import { GeminiImageProvider, buildGeminiImagePrompt } from "./gemini";
import { ProviderError } from "../retry";

const input: GenerateInput = {
  product: { name: "mug.jpg", bytes: Buffer.from("PRODUCT"), mime: "image/jpeg" },
  references: [{ bytes: Buffer.from("REF"), mime: "image/png" }],
  styleFingerprint: "warm golden light, dark studio",
  productDescription: "a white ceramic mug",
  stylePrompt: "unused here",
  seed: 1234,
};

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("GeminiImageProvider", () => {
  it("sends references then the product as inline parts and returns the image data URL", async () => {
    const fetchImpl = fetchReturning(200, {
      candidates: [
        {
          content: {
            parts: [{ text: "here you go" }, { inlineData: { mimeType: "image/png", data: "QUJD" } }],
          },
        },
      ],
    });
    const provider = new GeminiImageProvider({ apiKey: "k", fetchImpl });

    const url = await provider.generate(input);
    expect(url).toBe("data:image/png;base64,QUJD");

    const [calledUrl, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain("/models/gemini-3.1-flash-image:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("k");

    const body = JSON.parse(init.body as string);
    const parts = body.contents[0].parts;
    expect(parts[0].text).toContain("a white ceramic mug");
    expect(parts[1].inlineData).toEqual({ mimeType: "image/png", data: Buffer.from("REF").toString("base64") });
    expect(parts[2].inlineData).toEqual({ mimeType: "image/jpeg", data: Buffer.from("PRODUCT").toString("base64") });
    expect(body.generationConfig.responseModalities).toEqual(["IMAGE"]);
    expect(body.generationConfig.seed).toBe(1234);
  });

  it("honours a custom model id", async () => {
    const fetchImpl = fetchReturning(200, {
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/jpeg", data: "QQ==" } }] } }],
    });
    await new GeminiImageProvider({ apiKey: "k", model: "gemini-3-pro-image", fetchImpl }).generate(input);
    const [calledUrl] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledUrl).toContain("/models/gemini-3-pro-image:generateContent");
  });

  it("maps HTTP errors to ProviderError with the status (429 retryable, 400 not)", async () => {
    const p429 = new GeminiImageProvider({
      apiKey: "k",
      fetchImpl: fetchReturning(429, { error: { message: "quota" } }),
    });
    const e429 = await p429.generate(input).catch((e) => e);
    expect(e429).toBeInstanceOf(ProviderError);
    expect(e429.message).toBe("HTTP 429: quota");
    expect(e429.retryable).toBe(true);

    const p400 = new GeminiImageProvider({ apiKey: "k", fetchImpl: fetchReturning(400, {}) });
    const e400 = await p400.generate(input).catch((e) => e);
    expect(e400.retryable).toBe(false);
  });

  it("treats a safety block as non-retryable and a missing image as retryable", async () => {
    const blocked = new GeminiImageProvider({
      apiKey: "k",
      fetchImpl: fetchReturning(200, { candidates: [{ content: { parts: [{ text: "no" }] }, finishReason: "SAFETY" }] }),
    });
    const eBlocked = await blocked.generate(input).catch((e) => e);
    expect(eBlocked.retryable).toBe(false);

    const empty = new GeminiImageProvider({ apiKey: "k", fetchImpl: fetchReturning(200, { candidates: [] }) });
    const eEmpty = await empty.generate(input).catch((e) => e);
    expect(eEmpty).toBeInstanceOf(ProviderError);
    expect(eEmpty.retryable).toBe(true);
  });
});

describe("buildGeminiImagePrompt", () => {
  it("labels references and product and includes the shared fingerprint", () => {
    const prompt = buildGeminiImagePrompt(input);
    expect(prompt).toContain("STYLE REFERENCES");
    expect(prompt).toContain("PRODUCT");
    expect(prompt).toContain("warm golden light, dark studio");
    expect(prompt).toContain("a white ceramic mug");
  });
});
