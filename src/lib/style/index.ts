// Style module: turns the uploaded images into text the generators can use.
//
//   buildStyleFingerprint(references) — ONE shared style description per batch.
//   describeProduct(product)          — what each product is (per product).
//   writeCaption(...)                 — headline + caption per product.
//   buildProductPrompt(fp, desc)      — text prompt for text-only providers.
//
// Every function degrades to a deterministic fallback when no vision client is
// configured or the call fails, so the pipeline always runs.

import type { ImageBytes } from "@/lib/types";
import { visionClientFromEnv, type VisionClient } from "@/lib/vision";
import {
  FALLBACK_FINGERPRINT,
  FALLBACK_PRODUCT_DESCRIPTION,
  fallbackCopy,
  subjectFromName,
} from "./fallback";

const FINGERPRINT_INSTRUCTION =
  "You are a visual style analyst. Look at the reference image(s) and synthesize ONE " +
  "shared visual style as a single compact paragraph (about 40 words). Describe ONLY " +
  "transferable style: color palette, lighting, mood, composition, surface/texture, " +
  "and lens/depth of field. Do NOT name or describe any specific objects, products, " +
  "or subjects. Output the paragraph only, no preamble.";

const PRODUCT_INSTRUCTION =
  "Identify the main product in this image. Reply with a SHORT phrase (under 12 words) " +
  "naming the product and its key visual traits: color, material, and form. Do NOT " +
  "describe the background, lighting, or photographic style. Output the phrase only.";

const CAPTION_INSTRUCTION =
  "You write social media copy for a product post. Given the product and the visual " +
  "mood, write a punchy HEADLINE (2-4 words, Title Case) and a single CAPTION line " +
  "(under 12 words, friendly, no hashtags). Reply as strict JSON: " +
  '{"headline": "...", "caption": "..."}. No preamble, JSON only.';

export interface StyleOptions {
  /** Injectable for tests; defaults to the env-selected client (may be undefined). */
  vision?: VisionClient | null;
}

function client(opts: StyleOptions): VisionClient | undefined {
  if (opts.vision === null) return undefined;
  return opts.vision ?? visionClientFromEnv();
}

/** Build ONE shared style fingerprint from the reference image(s). */
export async function buildStyleFingerprint(
  references: ImageBytes[],
  opts: StyleOptions = {},
): Promise<string> {
  const vision = client(opts);
  if (!vision || references.length === 0) return FALLBACK_FINGERPRINT;
  try {
    return (await vision.caption(FINGERPRINT_INSTRUCTION, references)) || FALLBACK_FINGERPRINT;
  } catch {
    return FALLBACK_FINGERPRINT;
  }
}

/**
 * Describe ONE product image. Falls back to a subject derived from the filename
 * so the text prompt is still about the right object, then to a generic phrase.
 */
export async function describeProduct(
  product: ImageBytes,
  productName: string,
  opts: StyleOptions = {},
): Promise<string> {
  const fallback = subjectFromName(productName);
  const vision = client(opts);
  if (!vision) return fallback;
  try {
    return (await vision.caption(PRODUCT_INSTRUCTION, [product])) || fallback;
  } catch {
    return fallback;
  }
}

/** Headline + caption for one product. Deterministic copy when no LLM is available. */
export async function writeCaption(
  productDescription: string,
  fingerprint: string,
  productName: string,
  opts: StyleOptions = {},
): Promise<{ headline: string; caption: string }> {
  const vision = client(opts);
  if (vision) {
    try {
      const raw = await vision.complete(
        `${CAPTION_INSTRUCTION}\n\nProduct: ${productDescription}\nVisual mood: ${fingerprint}`,
      );
      const parsed = parseCopy(raw);
      if (parsed) return parsed;
    } catch {
      /* fall through */
    }
  }
  return fallbackCopy(productName, productDescription);
}

export function parseCopy(raw: string): { headline: string; caption: string } | undefined {
  const match = raw?.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    const obj = JSON.parse(match[0]) as { headline?: unknown; caption?: unknown };
    const headline = typeof obj.headline === "string" ? obj.headline.trim() : "";
    const caption = typeof obj.caption === "string" ? obj.caption.trim() : "";
    if (!headline || !caption) return undefined;
    return { headline: headline.slice(0, 40), caption: caption.slice(0, 120) };
  } catch {
    return undefined;
  }
}

/** Text prompt for text-only providers: shared spine verbatim + this product's subject. */
export function buildProductPrompt(fingerprint: string, productDescription: string): string {
  const subject = productDescription?.trim() || FALLBACK_PRODUCT_DESCRIPTION;
  const spine = fingerprint?.trim() || FALLBACK_FINGERPRINT;
  return `${subject}, presented as a social media product post. ${spine} High quality, professional, cohesive set.`;
}
