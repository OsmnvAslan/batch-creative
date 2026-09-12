import { beforeEach, describe, expect, it, vi } from "vitest";
import { startBatch } from "./orchestrator";
import { getBatch, resetStore, subscribe } from "./store";
import { ProviderError } from "./generation/retry";
import { CircuitBreaker } from "./generation/breaker";
import { getImage } from "./store";
import type { ImageProvider, StreamEvent } from "./types";
import type { UploadedImage } from "./validation";

const img = (name: string): UploadedImage => ({ name, mime: "image/jpeg", bytes: Buffer.from(name) });

const deps = {
  buildStyleFingerprint: vi.fn(async () => "warm daylight"),
  describeProduct: vi.fn(async (_img: { bytes: Buffer; mime: string }, name: string) => `a ${name}`),
  writeCaption: vi.fn(async (_d: string, _f: string, name: string) => ({
    headline: name,
    caption: `Meet ${name}`,
  })),
};

const dataUrl = (s: string) => `data:image/png;base64,${Buffer.from(s).toString("base64")}`;

function provider(name: string, impl: (productName: string) => Promise<string>): ImageProvider {
  return { name, kind: "text-to-image", generate: vi.fn(({ product }) => impl(product.name)) };
}

const generate = () => ({
  sleep: () => Promise.resolve(),
  baseMs: 1,
  retries: 1,
  breaker: new CircuitBreaker({ failureThreshold: 100 }),
});

describe("startBatch", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("returns immediately in the preparing state, then runs every job to done", async () => {
    const ok = provider("ok", async (n) => dataUrl(n));
    const { batch, finished } = startBatch(
      { products: [img("a.jpg"), img("b.jpg")], references: [img("ref.jpg")] },
      { deps, generate: { ...generate(), providers: [ok] } },
    );

    expect(batch.status).toBe("preparing");
    expect(batch.jobs.map((j) => j.status)).toEqual(["pending", "pending"]);

    const events: StreamEvent[] = [];
    subscribe(batch.id, (e) => events.push(e));
    await finished;

    const done = getBatch(batch.id)!;
    expect(done.status).toBe("complete");
    expect(done.styleFingerprint).toBe("warm daylight");
    expect(done.jobs.map((j) => j.status)).toEqual(["done", "done"]);
    expect(done.jobs[0].imageUrl).toMatch(/^\/api\/images\//);
    expect(getImage(done.jobs[0].imageUrl!.split("/").pop()!)?.bytes.toString()).toBe("a.jpg");
    expect(done.jobs[0]).toMatchObject({
      provider: "ok",
      imageConditioned: false,
      attempts: 1,
      headline: "a.jpg",
    });
    expect(events[0].type).toBe("style");
    expect(events.at(-1)?.type).toBe("done");
    expect(deps.buildStyleFingerprint).toHaveBeenCalledTimes(1);
    expect(deps.describeProduct).toHaveBeenCalledTimes(2);
  });

  it("isolates a failing product: siblings still complete and the batch finishes", async () => {
    const flaky = provider("flaky", async (n) => {
      if (n === "bad.jpg") throw new ProviderError("HTTP 500", { status: 500 });
      return dataUrl(n);
    });
    const { batch, finished } = startBatch(
      { products: [img("good.jpg"), img("bad.jpg")], references: [img("ref.jpg")] },
      { deps, generate: { ...generate(), providers: [flaky] } },
    );
    await finished;

    const done = getBatch(batch.id)!;
    expect(done.status).toBe("complete");
    expect(done.jobs[0].status).toBe("done");
    expect(done.jobs[1]).toMatchObject({ status: "failed", attempts: 2 });
    expect(done.jobs[1].error).toContain("flaky: HTTP 500");
  });

  it("fails every job and still completes if the fingerprint step throws", async () => {
    const { batch, finished } = startBatch(
      { products: [img("a.jpg")], references: [img("ref.jpg")] },
      {
        deps: {
          ...deps,
          buildStyleFingerprint: vi.fn(async () => {
            throw new Error("vision exploded");
          }),
        },
      },
    );
    await finished;
    const done = getBatch(batch.id)!;
    expect(done.status).toBe("complete");
    expect(done.jobs[0]).toMatchObject({ status: "failed", error: "vision exploded" });
  });

  it("passes the references, fingerprint and a shared seed to the provider", async () => {
    const spy = provider("spy", async (n) => dataUrl(n));
    const { finished } = startBatch(
      { products: [img("a.jpg"), img("b.jpg")], references: [img("r1.jpg"), img("r2.jpg")] },
      { deps, seed: 42, generate: { ...generate(), providers: [spy] } },
    );
    await finished;
    const calls = (spy.generate as ReturnType<typeof vi.fn>).mock.calls.map(([i]) => i);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.seed).toBe(42);
      expect(call.styleFingerprint).toBe("warm daylight");
      expect(call.references.map((r: { bytes: Buffer }) => r.bytes.toString())).toEqual(["r1.jpg", "r2.jpg"]);
    }
    expect(calls[0].productDescription).toBe("a a.jpg");
    expect(calls[0].stylePrompt).toContain("a a.jpg");
  });

  it("honours the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    const slow = provider("slow", async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return dataUrl(n);
    });
    const products = Array.from({ length: 6 }, (_, i) => img(`p${i}.jpg`));
    const { finished } = startBatch(
      { products, references: [img("ref.jpg")] },
      { deps, concurrency: 2, generate: { ...generate(), providers: [slow] } },
    );
    await finished;
    expect(peak).toBe(2);
  });
});
