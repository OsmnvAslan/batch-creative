// SQLite persistence via Node's built-in `node:sqlite` (no native addon to build).
//
// One connection per process, cached on globalThis so Next's dev-mode module
// reloads do not open a new handle each time. DATABASE_PATH selects the file;
// ":memory:" (the default under tests) keeps everything in RAM.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    bytes BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    style_fingerprint TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS batch_references (
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    PRIMARY KEY (batch_id, position)
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    product_image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
    headline TEXT,
    caption TEXT,
    provider TEXT,
    image_conditioned INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS jobs_batch ON jobs(batch_id, position);
  CREATE INDEX IF NOT EXISTS batches_created ON batches(created_at);
`;

export function databasePath(env: Record<string, string | undefined> = process.env): string {
  if (env.DATABASE_PATH) return env.DATABASE_PATH;
  return env.NODE_ENV === "test" ? ":memory:" : "./data/batch-creative.db";
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  recoverInterrupted(db);
  return db;
}

/**
 * A batch that was still running when the previous process died can never
 * finish; mark its open jobs failed and the batch complete so the UI does not
 * show a spinner forever.
 */
export function recoverInterrupted(db: DatabaseSync): void {
  db.prepare(
    `UPDATE jobs SET status = 'failed', error = 'Interrupted by a server restart'
     WHERE status IN ('pending', 'running')`,
  ).run();
  db.prepare(`UPDATE batches SET status = 'complete' WHERE status != 'complete'`).run();
}

type GlobalWithDb = typeof globalThis & { __batchCreativeDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (!g.__batchCreativeDb) g.__batchCreativeDb = openDatabase(databasePath());
  return g.__batchCreativeDb;
}

/** Test helper: close and drop the cached connection. */
export function closeDb(): void {
  const g = globalThis as GlobalWithDb;
  g.__batchCreativeDb?.close();
  delete g.__batchCreativeDb;
}
