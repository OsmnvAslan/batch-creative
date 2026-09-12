import { describe, expect, it } from "vitest";
import { databasePath, openDatabase, recoverInterrupted } from "./db";

describe("databasePath", () => {
  it("prefers DATABASE_PATH, then :memory: under test, then the data dir", () => {
    expect(databasePath({ DATABASE_PATH: "/tmp/x.db" })).toBe("/tmp/x.db");
    expect(databasePath({ NODE_ENV: "test" })).toBe(":memory:");
    expect(databasePath({ NODE_ENV: "production" })).toBe("./data/batch-creative.db");
  });
});

describe("recoverInterrupted", () => {
  it("fails jobs left open by a previous process and completes their batches", () => {
    const db = openDatabase(":memory:");
    db.prepare(`INSERT INTO images (id, mime, bytes, created_at) VALUES ('i', 'image/png', X'00', 0)`).run();
    db.prepare(`INSERT INTO batches (id, status, created_at) VALUES ('b', 'running', 0)`).run();
    db.prepare(
      `INSERT INTO jobs (id, batch_id, position, product_name, product_image_id, status)
       VALUES ('j1', 'b', 0, 'p', 'i', 'running'), ('j2', 'b', 1, 'p', 'i', 'done')`,
    ).run();

    recoverInterrupted(db);

    const jobs = db.prepare(`SELECT id, status, error FROM jobs ORDER BY position`).all() as Array<{
      id: string;
      status: string;
      error: string | null;
    }>;
    expect(jobs[0]).toMatchObject({ status: "failed", error: "Interrupted by a server restart" });
    expect(jobs[1]).toMatchObject({ status: "done", error: null });
    expect(db.prepare(`SELECT status FROM batches WHERE id = 'b'`).get()).toMatchObject({ status: "complete" });
    db.close();
  });
});
