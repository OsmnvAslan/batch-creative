import { describe, expect, it } from "vitest";
import { imageUrl, parseDataUrl } from "./images";

describe("parseDataUrl", () => {
  it("decodes mime and bytes", () => {
    const { mime, bytes } = parseDataUrl(`data:image/png;base64,${Buffer.from("hi").toString("base64")}`);
    expect(mime).toBe("image/png");
    expect(bytes.toString()).toBe("hi");
  });

  it("rejects non-data URLs", () => {
    expect(() => parseDataUrl("https://x/y.png")).toThrow();
    expect(() => parseDataUrl("data:image/png,plain")).toThrow();
  });
});

describe("imageUrl", () => {
  it("points at the images route", () => {
    expect(imageUrl("abc")).toBe("/api/images/abc");
  });
});
