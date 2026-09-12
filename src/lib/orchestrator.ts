// Batch orchestration: style fingerprint once, then one job per product through
// a concurrency-limited pool. Every job is isolated: a failure marks that job
// "failed" and never affects its siblings. The batch always reaches "complete".

import { buildStyleFingerprint, describeProduct, buildProductPrompt, writeCaption } from "@/lib/style";
import { generatePost, GenerationError, type GenerateOptions } from "@/lib/generation";
import { createBatch, setStyle, updateJob, completeBatch, newId } from "@/lib/store";
import { runPool, defaultConcurrency } from "@/lib/pool";
import type { Batch, ProductJob } from "@/lib/types";
import type { UploadedImage } from "@/lib/validation";

export interface StartBatchInput {
  products: UploadedImage[];
  references: UploadedImage[];
}

export interface StartBatchOptions {
  concurrency?: number;
  generate?: GenerateOptions;
  /** Injectable for tests. */
  deps?: Partial<{
    buildStyleFingerprint: typeof buildStyleFingerprint;
    describeProduct: typeof describeProduct;
    writeCaption: typeof writeCaption;
  }>;
}

/**
 * Create the batch synchronously (so the caller can return its id at once) and
 * kick off the work in the background. Returns the batch plus a promise that
 * resolves when the batch is complete (useful for tests; the route ignores it).
 */
export function startBatch(
  input: StartBatchInput,
  opts: StartBatchOptions = {},
): { batch: Batch; finished: Promise<void> } {
  const fingerprintFn = opts.deps?.buildStyleFingerprint ?? buildStyleFingerprint;
  const describeFn = opts.deps?.describeProduct ?? describeProduct;
  const captionFn = opts.deps?.writeCaption ?? writeCaption;

  const jobs: ProductJob[] = input.products.map((p) => ({
    id: newId(),
    productName: p.name,
    status: "pending",
    attempts: 0,
  }));
  const batch = createBatch(jobs);

  const finished = (async () => {
    // Style fingerprint is computed here, not in the request handler, so the
    // POST returns immediately even when the vision call is slow.
    const fingerprint = await fingerprintFn(input.references.map((r) => r.bytes));
    setStyle(batch.id, fingerprint);

    await runPool(input.products, opts.concurrency ?? defaultConcurrency(), async (product, i) => {
      const job = jobs[i];
      updateJob(batch.id, job.id, { status: "running" });
      try {
        const description = await describeFn(product.bytes, product.name);
        const prompt = buildProductPrompt(fingerprint, description);
        const [result, copy] = await Promise.all([
          generatePost(
            { productImage: product.bytes, productName: product.name, stylePrompt: prompt },
            opts.generate,
          ),
          captionFn(description, fingerprint, product.name),
        ]);
        updateJob(batch.id, job.id, {
          status: "done",
          imageDataUrl: result.imageDataUrl,
          headline: copy.headline,
          caption: copy.caption,
          provider: result.provider,
          attempts: result.attempts,
        });
      } catch (err) {
        updateJob(batch.id, job.id, {
          status: "failed",
          attempts: err instanceof GenerationError ? countAttempts(err) : job.attempts,
          error: describeError(err),
        });
      }
    });
  })()
    .catch((err) => {
      // Only reachable if the fingerprint step itself throws, which the style
      // module guards against. Fail every non-terminal job rather than hang.
      const message = describeError(err);
      for (const job of jobs) {
        if (job.status === "pending" || job.status === "running") {
          updateJob(batch.id, job.id, { status: "failed", error: message });
        }
      }
    })
    .finally(() => completeBatch(batch.id));

  return { batch, finished };
}

function countAttempts(err: GenerationError): number {
  const m = /after (\d+) attempt/.exec(err.message);
  return m ? Number(m[1]) : 0;
}

function describeError(err: unknown): string {
  if (err instanceof GenerationError) {
    return err.failures.length ? `${err.message}: ${err.failures.join(" | ")}` : err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
