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
export interface GenerateInput {
  productImage: Buffer;
  productName: string;
  stylePrompt: string;
}

export interface GenerateResult {
  imageDataUrl: string;
  provider: string;
  attempts: number;
}

export interface ImageProvider {
  readonly name: string;
  /** Returns an image data URL, or throws (ideally a ProviderError). */
  generate(input: GenerateInput): Promise<string>;
}
