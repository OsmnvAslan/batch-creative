import { describe, expect, it } from "vitest";
import { detectImageMime, validateCounts, validateImage, ValidationError } from "./validation";

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const webp = Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1");

describe("detectImageMime", () => {
  it("recognises jpeg, png and webp by magic bytes", () => {
    expect(detectImageMime(jpeg)).toBe("image/jpeg");
    expect(detectImageMime(png)).toBe("image/png");
    expect(detectImageMime(webp)).toBe("image/webp");
  });

  it("rejects anything else", () => {
    expect(detectImageMime(Buffer.from("<svg/>"))).toBeUndefined();
    expect(detectImageMime(Buffer.from("%PDF-1.4"))).toBeUndefined();
    expect(detectImageMime(Buffer.alloc(0))).toBeUndefined();
  });
});

describe("validateImage", () => {
  it("accepts a real image under the limit", () => {
    expect(validateImage("a.jpg", jpeg)).toEqual({ name: "a.jpg", mime: "image/jpeg", bytes: jpeg });
  });

  it("rejects empty, oversized and non-image files", () => {
    expect(() => validateImage("a.jpg", Buffer.alloc(0))).toThrow(ValidationError);
    expect(() => validateImage("a.jpg", jpeg, 4)).toThrow(/limit/);
    expect(() => validateImage("a.txt", Buffer.from("hello"))).toThrow(/not a JPEG/);
  });
});

describe("validateCounts", () => {
  it("enforces product and reference bounds", () => {
    expect(() => validateCounts(0, 1)).toThrow(/product/);
    expect(() => validateCounts(13, 1, 12)).toThrow(/At most 12/);
    expect(() => validateCounts(1, 0)).toThrow(/reference/);
    expect(() => validateCounts(1, 3)).toThrow(/At most 2/);
    expect(() => validateCounts(3, 2)).not.toThrow();
  });
});
