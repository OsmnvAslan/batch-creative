import type { ImageBytes } from "@/lib/types";

/** Parse a base64 `data:` URL into bytes + mime. Throws on anything else. */
export function parseDataUrl(url: string): ImageBytes {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(url);
  if (!m) throw new Error("Expected a base64 data URL");
  return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
}

export function imageUrl(id: string): string {
  return `/api/images/${id}`;
}
