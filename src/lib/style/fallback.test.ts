import { describe, expect, it } from "vitest";
import { FALLBACK_PRODUCT_DESCRIPTION, fallbackCopy, subjectFromName } from "./fallback";

describe("subjectFromName", () => {
  it("derives a subject from a descriptive filename", () => {
    expect(subjectFromName("white-sneaker_01.jpg")).toContain("white sneaker");
    expect(subjectFromName("Leather Watch.png")).toContain("leather watch");
  });

  it("falls back to the generic descriptor for noise-only names", () => {
    expect(subjectFromName("IMG_4821.jpg")).toBe(FALLBACK_PRODUCT_DESCRIPTION);
    expect(subjectFromName("Product 2.png")).toBe(FALLBACK_PRODUCT_DESCRIPTION);
    expect(subjectFromName("")).toBe(FALLBACK_PRODUCT_DESCRIPTION);
  });
});

describe("fallbackCopy", () => {
  it("keeps a usable headline for noise-only names", () => {
    expect(fallbackCopy("Product 2.png", "x").headline).toBe("Product 2");
    expect(fallbackCopy("image.png", "x").headline).toBe("Image");
  });

  it("title-cases descriptive names and never doubles the article", () => {
    expect(fallbackCopy("red-mug.jpg", "x")).toEqual({
      headline: "Red Mug",
      caption: "Meet the red mug — now in our latest collection.",
    });
    expect(fallbackCopy("the-classic-tee.jpg", "x").caption).toMatch(/^Meet the classic tee/);
  });
});
