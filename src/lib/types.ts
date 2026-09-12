// Shared contract types used by the API routes, the generation/style modules
// and the UI.

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface ProductJob {
  id: string;
  productName: string;
  status: JobStatus;
  imageDataUrl?: string; // present iff status === "done"
  headline?: string; // short post headline (done)
  caption?: string; // one-line post caption (done)
  provider?: string; // provider that produced the image (done)
  /** True when the provider saw the actual product + reference pixels (image-to-image). */
  imageConditioned?: boolean;
  attempts: number; // total generation attempts across providers
  error?: string; // present iff status === "failed"
}

export type BatchStatus = "preparing" | "running" | "complete";

export interface Batch {
  id: string;
  status: BatchStatus;
  /** Shared style descriptor derived from the references; empty while "preparing". */
  styleFingerprint: string;
  jobs: ProductJob[];
  createdAt: number;
}

// ---- SSE events (GET /api/batch/[id]/stream) ----
export type StreamEvent =
  | { type: "init"; batch: Batch }
  | { type: "style"; styleFingerprint: string }
  | { type: "job"; job: ProductJob }
  | { type: "done"; batchId: string };

// ---- Generation module ----
export interface ImageBytes {
  bytes: Buffer;
  mime: string;
}

export interface GenerateInput {
  product: ImageBytes & { name: string };
  /** 1–2 reference images that define the target style. */
  references: ImageBytes[];
  /** Shared style description (identical for every product in the batch). */
  styleFingerprint: string;
  /** What this product is, in words. */
  productDescription: string;
  /** Full text prompt (fingerprint + subject) for text-only providers. */
  stylePrompt: string;
  /** Per-batch seed shared by all products, for reproducibility/coherence. */
  seed: number;
}

export interface GenerateResult {
  imageDataUrl: string;
  provider: string;
  imageConditioned: boolean;
  attempts: number;
}

export type ProviderKind = "image-to-image" | "text-to-image";

export interface ImageProvider {
  readonly name: string;
  /** Whether the provider consumes the uploaded pixels or only the text prompt. */
  readonly kind: ProviderKind;
  /** Returns an image data URL, or throws (ideally a ProviderError). */
  generate(input: GenerateInput): Promise<string>;
}
