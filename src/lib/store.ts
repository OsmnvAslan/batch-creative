// Batch store: SQLite for state and image bytes, plus an in-process event
// emitter per batch for SSE fan-out. Single process by design; the emitter map
// lives on globalThis so dev-mode module reloads keep the same listeners.

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { imageUrl } from "@/lib/images";
import type {
  Batch,
  BatchStatus,
  BatchSummary,
  ImageBytes,
  JobStatus,
  ProductJob,
  StreamEvent,
} from "@/lib/types";

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------- emitters

type GlobalWithEmitters = typeof globalThis & { __batchCreativeEmitters?: Map<string, EventEmitter> };

function emitters(): Map<string, EventEmitter> {
  const g = globalThis as GlobalWithEmitters;
  if (!g.__batchCreativeEmitters) g.__batchCreativeEmitters = new Map();
  return g.__batchCreativeEmitters;
}

function emitterFor(batchId: string): EventEmitter {
  let emitter = emitters().get(batchId);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    emitters().set(batchId, emitter);
  }
  return emitter;
}

function emit(batchId: string, event: StreamEvent): void {
  emitters().get(batchId)?.emit("event", event);
}

/** Subscribe to a batch's events. Returns an unsubscribe fn, or undefined if unknown. */
export function subscribe(
  batchId: string,
  listener: (event: StreamEvent) => void,
): (() => void) | undefined {
  if (!batchExists(batchId)) return undefined;
  const emitter = emitterFor(batchId);
  emitter.on("event", listener);
  return () => {
    emitter.off("event", listener);
  };
}

// ------------------------------------------------------------------ images

export function newId(): string {
  return randomUUID();
}

export function saveImage(image: ImageBytes, now = Date.now()): string {
  const id = newId();
  getDb()
    .prepare(`INSERT INTO images (id, mime, bytes, created_at) VALUES (?, ?, ?, ?)`)
    .run(id, image.mime, image.bytes, now);
  return id;
}

export function getImage(id: string): ImageBytes | undefined {
  const row = getDb().prepare(`SELECT mime, bytes FROM images WHERE id = ?`).get(id) as
    | { mime: string; bytes: Uint8Array }
    | undefined;
  return row ? { mime: row.mime, bytes: Buffer.from(row.bytes) } : undefined;
}

// ----------------------------------------------------------------- batches

export interface CreateBatchInput {
  products: Array<{ name: string; image: ImageBytes }>;
  references: ImageBytes[];
}

export function createBatch(input: CreateBatchInput, now = Date.now()): Batch {
  const db = getDb();
  const batchId = newId();
  const insertBatch = db.prepare(
    `INSERT INTO batches (id, status, style_fingerprint, created_at) VALUES (?, 'preparing', '', ?)`,
  );
  const insertRef = db.prepare(
    `INSERT INTO batch_references (batch_id, position, image_id) VALUES (?, ?, ?)`,
  );
  const insertJob = db.prepare(
    `INSERT INTO jobs (id, batch_id, position, product_name, product_image_id, status, attempts)
     VALUES (?, ?, ?, ?, ?, 'pending', 0)`,
  );

  db.exec("BEGIN");
  try {
    insertBatch.run(batchId, now);
    input.references.forEach((ref, i) => insertRef.run(batchId, i, saveImage(ref, now)));
    input.products.forEach((p, i) =>
      insertJob.run(newId(), batchId, i, p.name, saveImage(p.image, now)),
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return getBatch(batchId)!;
}

function batchExists(id: string): boolean {
  return Boolean(getDb().prepare(`SELECT 1 FROM batches WHERE id = ?`).get(id));
}

interface BatchRow {
  id: string;
  status: BatchStatus;
  style_fingerprint: string;
  created_at: number;
}

interface JobRow {
  id: string;
  product_name: string;
  product_image_id: string;
  status: JobStatus;
  image_id: string | null;
  headline: string | null;
  caption: string | null;
  provider: string | null;
  image_conditioned: number | null;
  attempts: number;
  error: string | null;
}

function toJob(row: JobRow): ProductJob {
  const job: ProductJob = {
    id: row.id,
    productName: row.product_name,
    productImageUrl: imageUrl(row.product_image_id),
    status: row.status,
    attempts: row.attempts,
  };
  if (row.image_id) job.imageUrl = imageUrl(row.image_id);
  if (row.headline) job.headline = row.headline;
  if (row.caption) job.caption = row.caption;
  if (row.provider) job.provider = row.provider;
  if (row.image_conditioned !== null) job.imageConditioned = row.image_conditioned === 1;
  if (row.error) job.error = row.error;
  return job;
}

function referenceUrls(batchId: string): string[] {
  return (
    getDb()
      .prepare(`SELECT image_id FROM batch_references WHERE batch_id = ? ORDER BY position`)
      .all(batchId) as Array<{ image_id: string }>
  ).map((r) => imageUrl(r.image_id));
}

export function getBatch(id: string): Batch | undefined {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(id) as BatchRow | undefined;
  if (!row) return undefined;
  const jobs = db.prepare(`SELECT * FROM jobs WHERE batch_id = ? ORDER BY position`).all(id) as unknown as JobRow[];
  return {
    id: row.id,
    status: row.status,
    styleFingerprint: row.style_fingerprint,
    referenceImageUrls: referenceUrls(id),
    jobs: jobs.map(toJob),
    createdAt: row.created_at,
  };
}

export function getJob(batchId: string, jobId: string): ProductJob | undefined {
  const row = getDb()
    .prepare(`SELECT * FROM jobs WHERE batch_id = ? AND id = ?`)
    .get(batchId, jobId) as JobRow | undefined;
  return row ? toJob(row) : undefined;
}

export function listBatches(limit = 20): BatchSummary[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM batches ORDER BY created_at DESC LIMIT ?`)
    .all(limit) as unknown as BatchRow[];
  const counts = db.prepare(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'done') AS done,
       SUM(status = 'failed') AS failed
     FROM jobs WHERE batch_id = ?`,
  );
  const previews = db.prepare(
    `SELECT image_id FROM jobs WHERE batch_id = ? AND image_id IS NOT NULL ORDER BY position LIMIT 4`,
  );
  return rows.map((row) => {
    const c = counts.get(row.id) as { total: number; done: number | null; failed: number | null };
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      total: c.total,
      done: c.done ?? 0,
      failed: c.failed ?? 0,
      referenceImageUrls: referenceUrls(row.id),
      previewImageUrls: (previews.all(row.id) as Array<{ image_id: string }>).map((r) =>
        imageUrl(r.image_id),
      ),
    };
  });
}

/** Record the shared style fingerprint and move the batch to "running". */
export function setStyle(batchId: string, styleFingerprint: string): void {
  const res = getDb()
    .prepare(`UPDATE batches SET style_fingerprint = ?, status = 'running' WHERE id = ?`)
    .run(styleFingerprint, batchId);
  if (res.changes === 0) return;
  emit(batchId, { type: "style", styleFingerprint });
}

export type JobPatch = Partial<
  Pick<ProductJob, "status" | "headline" | "caption" | "provider" | "imageConditioned" | "attempts" | "error">
> & {
  /** Generated image bytes; stored and exposed as imageUrl. */
  image?: ImageBytes;
};

const PATCH_COLUMNS: Record<Exclude<keyof JobPatch, "image">, string> = {
  status: "status",
  headline: "headline",
  caption: "caption",
  provider: "provider",
  imageConditioned: "image_conditioned",
  attempts: "attempts",
  error: "error",
};

export function updateJob(batchId: string, jobId: string, patch: JobPatch): void {
  const db = getDb();
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  for (const key of Object.keys(PATCH_COLUMNS) as Array<keyof typeof PATCH_COLUMNS>) {
    if (!(key in patch)) continue;
    const value = patch[key];
    sets.push(`${PATCH_COLUMNS[key]} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as string | number | null) ?? null);
  }
  if (patch.image) {
    sets.push("image_id = ?");
    values.push(saveImage(patch.image));
  }
  if (sets.length === 0) return;

  const res = db
    .prepare(`UPDATE jobs SET ${sets.join(", ")} WHERE batch_id = ? AND id = ?`)
    .run(...values, batchId, jobId);
  if (res.changes === 0) return;

  const job = getJob(batchId, jobId);
  if (job) emit(batchId, { type: "job", job });
}

export function completeBatch(batchId: string): void {
  const res = getDb().prepare(`UPDATE batches SET status = 'complete' WHERE id = ?`).run(batchId);
  if (res.changes === 0) return;
  emit(batchId, { type: "done", batchId });
}

export function deleteBatch(batchId: string): boolean {
  const db = getDb();
  const imageIds = (
    db
      .prepare(
        `SELECT product_image_id AS id FROM jobs WHERE batch_id = ?
         UNION SELECT image_id FROM jobs WHERE batch_id = ? AND image_id IS NOT NULL
         UNION SELECT image_id FROM batch_references WHERE batch_id = ?`,
      )
      .all(batchId, batchId, batchId) as Array<{ id: string }>
  ).map((r) => r.id);

  db.exec("BEGIN");
  try {
    const res = db.prepare(`DELETE FROM batches WHERE id = ?`).run(batchId);
    const del = db.prepare(`DELETE FROM images WHERE id = ?`);
    for (const id of imageIds) del.run(id);
    db.exec("COMMIT");
    emitters().get(batchId)?.removeAllListeners();
    emitters().delete(batchId);
    return res.changes > 0;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function ttlMs(): number {
  const raw = Number(process.env.BATCH_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

/** Drop batches (and their images) older than the TTL. Returns the number evicted. */
export function evictExpired(now = Date.now(), ttl = ttlMs()): number {
  const rows = getDb()
    .prepare(`SELECT id FROM batches WHERE created_at < ?`)
    .all(now - ttl) as Array<{ id: string }>;
  let evicted = 0;
  for (const { id } of rows) if (deleteBatch(id)) evicted++;
  return evicted;
}

/** Test helper: wipe every table and listener. */
export function resetStore(): void {
  const db = getDb();
  db.exec(`DELETE FROM jobs; DELETE FROM batch_references; DELETE FROM batches; DELETE FROM images;`);
  for (const e of emitters().values()) e.removeAllListeners();
  emitters().clear();
}

// Periodic sweep. `unref` so the timer never keeps the process alive.
if (process.env.NODE_ENV !== "test") {
  const timer = setInterval(() => {
    try {
      evictExpired();
    } catch (err) {
      console.error("batch eviction failed", err);
    }
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
}
