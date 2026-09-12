import { describe, expect, it, vi } from "vitest";
import { buildProductPrompt, buildStyleFingerprint, describeProduct, parseCopy, writeCaption } from "./index";
import { FALLBACK_FINGERPRINT } from "./fallback";
import type { VisionClient } from "@/lib/vision";

const img = { bytes: Buffer.from("x"), mime: "image/jpeg" };

function vision(caption: () => Promise<string>, complete: () => Promise<string> = caption): VisionClient {
  return { name: "test", caption: vi.fn(caption), complete: vi.fn(complete) };
}

describe("buildStyleFingerprint", () => {
  it("uses the vision caption when available", async () => {
    const v = vision(async () => "moody teal palette");
    expect(await buildStyleFingerprint([img], { vision: v })).toBe("moody teal palette");
    expect(v.caption).toHaveBeenCalledTimes(1);
  });

  it("falls back to the fixed template without a client, with no references, or on error", async () => {
    expect(await buildStyleFingerprint([img], { vision: null })).toBe(FALLBACK_FINGERPRINT);
    expect(await buildStyleFingerprint([], { vision: vision(async () => "x") })).toBe(FALLBACK_FINGERPRINT);
    const failing = vision(async () => {
      throw new Error("429");
    });
    expect(await buildStyleFingerprint([img], { vision: failing })).toBe(FALLBACK_FINGERPRINT);
  });
});

describe("describeProduct", () => {
  it("prefers the caption, then the filename, then the generic phrase", async () => {
    expect(await describeProduct(img, "x.jpg", { vision: vision(async () => "red mug") })).toBe("red mug");
    expect(await describeProduct(img, "red-mug.jpg", { vision: null })).toContain("red mug");
    expect(await describeProduct(img, "IMG_1.jpg", { vision: null })).toContain("the product");
  });
});

describe("writeCaption", () => {
  it("parses JSON copy, tolerating code fences", async () => {
    const v = vision(async () => "", async () => '```json\n{"headline":"Morning Ritual","caption":"Start slow."}\n```');
    expect(await writeCaption("mug", "fp", "mug.jpg", { vision: v })).toEqual({
      headline: "Morning Ritual",
      caption: "Start slow.",
    });
  });

  it("falls back to deterministic copy on bad output or no client", async () => {
    const v = vision(async () => "", async () => '{"headline":"Only"}');
    expect(await writeCaption("mug", "fp", "red-mug.jpg", { vision: v })).toMatchObject({ headline: "Red Mug" });
    expect(await writeCaption("mug", "fp", "red-mug.jpg", { vision: null })).toMatchObject({ headline: "Red Mug" });
  });
});

describe("parseCopy / buildProductPrompt", () => {
  it("requires both fields and truncates long values", () => {
    expect(parseCopy("nope")).toBeUndefined();
    expect(parseCopy('{"headline":"","caption":"x"}')).toBeUndefined();
    expect(parseCopy(`{"headline":"${"a".repeat(60)}","caption":"c"}`)?.headline).toHaveLength(40);
  });

  it("keeps the fingerprint verbatim and swaps the subject", () => {
    const p = buildProductPrompt("FP", "a mug");
    expect(p.startsWith("a mug,")).toBe(true);
    expect(p).toContain("FP");
    expect(buildProductPrompt("", "")).toContain(FALLBACK_FINGERPRINT);
  });
});
