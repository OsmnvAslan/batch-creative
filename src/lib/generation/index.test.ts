import { describe, expect, it, vi } from "vitest";
import type { GenerateInput, ImageProvider } from "@/lib/types";
import { GenerationError, generatePost, providersFromEnv } from "./index";
import { ProviderError } from "./retry";
import { SemaphoreRegistry } from "./semaphore";

const input: GenerateInput = {
  product: { name: "sneaker.jpg", bytes: Buffer.from(""), mime: "image/jpeg" },
  references: [],
  styleFingerprint: "warm light",
  productDescription: "a sneaker",
  stylePrompt: "a sneaker, warm light",
  seed: 7,
};

function provider(name: string, impl: () => Promise<string>, kind: ImageProvider["kind"] = "text-to-image"): ImageProvider {
  return { name, kind, generate: vi.fn(impl) };
}

const flaky = (failures: number, status: number, result = "data:ok") => {
  let n = 0;
  return async () => {
    if (n++ < failures) throw new ProviderError(`HTTP ${status}`, { status });
    return result;
  };
};

const opts = { sleep: () => Promise.resolve(), baseMs: 1 };

describe("generatePost", () => {
  it("uses the primary provider when it succeeds", async () => {
    const a = provider("a", async () => "data:a");
    const b = provider("b", async () => "data:b");
    const res = await generatePost(input, { ...opts, providers: [a, b] });
    expect(res).toEqual({ imageDataUrl: "data:a", provider: "a", imageConditioned: false, attempts: 1 });
    expect(b.generate).not.toHaveBeenCalled();
  });

  it("flags results from an image-to-image provider", async () => {
    const a = provider("gemini", async () => "data:a", "image-to-image");
    const res = await generatePost(input, { ...opts, providers: [a] });
    expect(res.imageConditioned).toBe(true);
  });

  it("retries a transient failure on the same provider before failing over", async () => {
    const a = provider("a", flaky(1, 503, "data:a"));
    const b = provider("b", async () => "data:b");
    const res = await generatePost(input, { ...opts, providers: [a, b] });
    expect(res.provider).toBe("a");
    expect(res.attempts).toBe(2);
    expect(b.generate).not.toHaveBeenCalled();
  });

  it("fails over after the primary exhausts its retries and aggregates attempts", async () => {
    const a = provider("a", flaky(99, 500));
    const b = provider("b", async () => "data:b");
    const res = await generatePost(input, { ...opts, providers: [a, b], retries: 2 });
    expect(res.provider).toBe("b");
    expect(res.attempts).toBe(4); // 3 on a + 1 on b
    expect(a.generate).toHaveBeenCalledTimes(3);
  });

  it("fails over immediately on a non-retryable error", async () => {
    const a = provider("a", async () => {
      throw new ProviderError("HTTP 401", { status: 401 });
    });
    const b = provider("b", async () => "data:b");
    const res = await generatePost(input, { ...opts, providers: [a, b], retries: 2 });
    expect(res.provider).toBe("b");
    expect(res.attempts).toBe(2);
    expect(a.generate).toHaveBeenCalledTimes(1);
  });

  it("throws GenerationError listing every provider when all fail", async () => {
    const a = provider("a", flaky(99, 500));
    const b = provider("b", async () => {
      throw new ProviderError("HTTP 400", { status: 400 });
    });
    const err = await generatePost(input, { ...opts, providers: [a, b], retries: 1 }).catch((e) => e);
    expect(err).toBeInstanceOf(GenerationError);
    expect(err.message).toContain("after 3 attempt");
    expect(err.failures).toEqual(["a: HTTP 500", "b: HTTP 400"]);
  });

  it("throws when no providers are configured", async () => {
    await expect(generatePost(input, { providers: [] })).rejects.toBeInstanceOf(GenerationError);
  });
});

describe("generatePost concurrency", () => {
  it("serialises calls to a provider that declares concurrency 1, across parallel generatePost calls", async () => {
    let inFlight = 0;
    let peak = 0;
    const serial: ImageProvider = {
      name: "serial",
      kind: "text-to-image",
      concurrency: 1,
      generate: async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight--;
        return "data:ok";
      },
    };
    const semaphores = new SemaphoreRegistry();
    await Promise.all(
      Array.from({ length: 4 }, () => generatePost(input, { ...opts, providers: [serial], semaphores })),
    );
    expect(peak).toBe(1);
  });
});

describe("providersFromEnv", () => {
  it("is pollinations-only by default", () => {
    expect(providersFromEnv({}).map((p) => p.name)).toEqual(["pollinations"]);
  });

  it("puts gemini first with a key, then together and mock when enabled", () => {
    const names = providersFromEnv({
      GEMINI_API_KEY: "g",
      TOGETHER_API_KEY: "k",
      ENABLE_MOCK_PROVIDER: "true",
    }).map((p) => p.name);
    expect(names).toEqual(["gemini", "pollinations", "together", "mock"]);
  });
});
