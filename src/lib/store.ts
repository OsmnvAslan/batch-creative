// In-memory batch store with a per-batch event emitter for SSE fan-out.
//
// Batches are evicted after BATCH_TTL_MS (default 1h) so a long-running process
// does not accumulate base64 images forever. Single-process only by design.

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { Batch, ProductJob, StreamEvent } from "@/lib/types";

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const batches = new Map<string, Batch>();
const emitters = new Map<string, EventEmitter>();

function ttlMs(): number {
  const raw = Number(process.env.BATCH_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

function emitterFor(batchId: string): EventEmitter {
  let emitter = emitters.get(batchId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    emitters.set(batchId, emitter);
  }
  return emitter;
}

function emit(batchId: string, event: StreamEvent): void {
  emitters.get(batchId)?.emit("event", event);
}

export function newId(): string {
  return randomUUID();
}

export function createBatch(jobs: ProductJob[], now = Date.now()): Batch {
  const batch: Batch = {
    id: newId(),
    status: "preparing",
    styleFingerprint: "",
    jobs,
    createdAt: now,
  };
  batches.set(batch.id, batch);
  return batch;
}

export function getBatch(id: string): Batch | undefined {
  return batches.get(id);
}

/** Record the shared style fingerprint and move the batch to "running". */
export function setStyle(batchId: string, styleFingerprint: string): void {
  const batch = batches.get(batchId);
  if (!batch) return;
  batch.styleFingerprint = styleFingerprint;
  batch.status = "running";
  emit(batchId, { type: "style", styleFingerprint });
}

export function updateJob(batchId: string, jobId: string, patch: Partial<ProductJob>): void {
  const batch = batches.get(batchId);
  const job = batch?.jobs.find((j) => j.id === jobId);
  if (!batch || !job) return;
  Object.assign(job, patch);
  emit(batchId, { type: "job", job });
}

export function completeBatch(batchId: string): void {
  const batch = batches.get(batchId);
  if (!batch) return;
  batch.status = "complete";
  emit(batchId, { type: "done", batchId });
}

/** Subscribe to a batch's events. Returns an unsubscribe fn, or undefined if unknown. */
export function subscribe(
  batchId: string,
  listener: (event: StreamEvent) => void,
): (() => void) | undefined {
  if (!batches.has(batchId)) return undefined;
  const emitter = emitterFor(batchId);
  emitter.on("event", listener);
  return () => {
    emitter.off("event", listener);
  };
}

/** Drop batches older than the TTL. Returns the number evicted. */
export function evictExpired(now = Date.now(), ttl = ttlMs()): number {
  let evicted = 0;
  for (const [id, batch] of batches) {
    if (now - batch.createdAt > ttl) {
      batches.delete(id);
      emitters.get(id)?.removeAllListeners();
      emitters.delete(id);
      evicted++;
    }
  }
  return evicted;
}

/** Test helper: clear everything. */
export function resetStore(): void {
  batches.clear();
  for (const e of emitters.values()) e.removeAllListeners();
  emitters.clear();
}

// Periodic sweep. `unref` so the timer never keeps the process alive.
if (process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => evictExpired(), SWEEP_INTERVAL_MS);
  timer.unref?.();
}
