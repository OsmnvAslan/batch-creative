// Server-side validation of uploaded images.

export const MAX_REFERENCES = 2;
export const DEFAULT_MAX_PRODUCTS = 12;
export const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export function maxProducts(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.MAX_PRODUCTS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_PRODUCTS;
}

export function maxFileBytes(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.MAX_FILE_BYTES);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_FILE_BYTES;
}

/** Sniff the image type from magic bytes. Returns undefined for anything else. */
export function detectImageMime(buf: Uint8Array): ImageMime | undefined {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface UploadedImage {
  name: string;
  mime: ImageMime;
  bytes: Buffer;
}

/**
 * Validate one uploaded file: size limit + real image content (by magic bytes,
 * not by the client-supplied type).
 */
export function validateImage(
  name: string,
  bytes: Buffer,
  limit = maxFileBytes(),
): UploadedImage {
  if (bytes.length === 0) throw new ValidationError(`"${name}" is empty`);
  if (bytes.length > limit) {
    throw new ValidationError(
      `"${name}" is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is ${Math.round(limit / 1024 / 1024)} MB`,
    );
  }
  const mime = detectImageMime(bytes);
  if (!mime) throw new ValidationError(`"${name}" is not a JPEG, PNG or WebP image`);
  return { name, mime, bytes };
}

export function validateCounts(productCount: number, referenceCount: number, limit = maxProducts()): void {
  if (productCount === 0) throw new ValidationError("At least one product image is required");
  if (productCount > limit) throw new ValidationError(`At most ${limit} product images per batch`);
  if (referenceCount === 0) throw new ValidationError("At least one reference image is required");
  if (referenceCount > MAX_REFERENCES) {
    throw new ValidationError(`At most ${MAX_REFERENCES} reference images are allowed`);
  }
}
