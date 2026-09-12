import type { GenerateInput, ImageProvider } from "@/lib/types";
import { stableSeed } from "./shared";

// Deterministic offline provider: a labelled SVG placeholder. Opt-in via
// ENABLE_MOCK_PROVIDER=true. Useful for demos without network and for tests.

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function mockSvg(productName: string): string {
  const hue = stableSeed(productName) % 360;
  const bg = `hsl(${hue}, 60%, 45%)`;
  const accent = `hsl(${(hue + 40) % 360}, 70%, 75%)`;
  const label = escapeXml(productName || "Product");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${bg}"/>
  <circle cx="512" cy="430" r="220" fill="${accent}" opacity="0.85"/>
  <text x="512" y="780" font-family="sans-serif" font-size="64" font-weight="bold" fill="#ffffff" text-anchor="middle">${label}</text>
  <text x="512" y="850" font-family="sans-serif" font-size="32" fill="#ffffff" opacity="0.8" text-anchor="middle">mock provider</text>
</svg>`;
}

export class MockProvider implements ImageProvider {
  readonly name = "mock";
  readonly kind = "text-to-image" as const;

  async generate(input: GenerateInput): Promise<string> {
    const svg = mockSvg(input.product.name);
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  }
}
