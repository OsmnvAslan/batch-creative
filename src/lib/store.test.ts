import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeBatch,
  createBatch,
  deleteBatch,
  evictExpired,
  getBatch,
  getImage,
  listBatches,
  resetStore,
  setStyle,
  subscribe,
  updateJob,
} from "./store";
import type { StreamEvent } from "./types";

const img = (s: string) => ({ bytes: Buffer.from(s), mime: "image/jpeg" });
const input = (names = ["a"]) => ({
  products: names.map((n) => ({ name: `${n}.jpg`, image: img(n) })),
  references: [img("ref")],
});

describe("store", () => {
  beforeEach(() => resetStore());

  it("creates a batch in the preparing state with stored originals", () => {
    const batch = createBatch(input(["a", "b"]));
    expect(batch.status).toBe("preparing");
    expect(batch.styleFingerprint).toBe("");
    expect(batch.jobs.map((j) => j.productName)).toEqual(["a.jpg", "b.jpg"]);
    expect(batch.jobs[0].productImageUrl).toMatch(/^\/api\/images\//);
    expect(batch.referenceImageUrls).toHaveLength(1);
    expect(getBatch(batch.id)).toEqual(batch);

    const refId = batch.referenceImageUrls[0].split("/").pop()!;
    expect(getImage(refId)?.bytes.toString()).toBe("ref");
  });

  it("emits style, job and done events in order to subscribers", () => {
    const batch = createBatch(input());
    const jobId = batch.jobs[0].id;
    const events: StreamEvent[] = [];
    const unsubscribe = subscribe(batch.id, (e) => events.push(e));
    expect(unsubscribe).toBeTypeOf("function");

    setStyle(batch.id, "warm light");
    updateJob(batch.id, jobId, { status: "running" });
    updateJob(batch.id, jobId, { status: "done", image: img("out"), attempts: 1, imageConditioned: true });
    completeBatch(batch.id);

    expect(events.map((e) => e.type)).toEqual(["style", "job", "job", "done"]);
    const stored = getBatch(batch.id)!;
    expect(stored.status).toBe("complete");
    expect(stored.styleFingerprint).toBe("warm light");
    expect(stored.jobs[0]).toMatchObject({ status: "done", imageConditioned: true, attempts: 1 });
    expect(stored.jobs[0].imageUrl).toMatch(/^\/api\/images\//);
    expect((events[2] as { job: { imageUrl?: string } }).job.imageUrl).toBe(stored.jobs[0].imageUrl);

    unsubscribe?.();
    updateJob(batch.id, jobId, { attempts: 9 });
    expect(events).toHaveLength(4);
  });

  it("ignores updates for unknown batches or jobs", () => {
    const batch = createBatch(input());
    updateJob("nope", batch.jobs[0].id, { status: "running" });
    updateJob(batch.id, "nope", { status: "running" });
    expect(getBatch(batch.id)?.jobs[0].status).toBe("pending");
    expect(subscribe("nope", () => {})).toBeUndefined();
  });

  it("lists batches newest first with counts and previews", () => {
    const older = createBatch(input(["a", "b"]), 1000);
    const newer = createBatch(input(["c"]), 2000);
    updateJob(older.id, older.jobs[0].id, { status: "done", image: img("x") });
    updateJob(older.id, older.jobs[1].id, { status: "failed", error: "boom" });

    const list = listBatches();
    expect(list.map((b) => b.id)).toEqual([newer.id, older.id]);
    expect(list[1]).toMatchObject({ total: 2, done: 1, failed: 1 });
    expect(list[1].previewImageUrls).toHaveLength(1);
    expect(list[0]).toMatchObject({ total: 1, done: 0, failed: 0, previewImageUrls: [] });
  });

  it("deletes a batch together with all of its images", () => {
    const batch = createBatch(input());
    updateJob(batch.id, batch.jobs[0].id, { status: "done", image: img("out") });
    const ids = [
      batch.referenceImageUrls[0],
      batch.jobs[0].productImageUrl,
      getBatch(batch.id)!.jobs[0].imageUrl!,
    ].map((u) => u.split("/").pop()!);

    expect(deleteBatch(batch.id)).toBe(true);
    expect(getBatch(batch.id)).toBeUndefined();
    for (const id of ids) expect(getImage(id)).toBeUndefined();
    expect(deleteBatch(batch.id)).toBe(false);
  });

  it("evicts batches older than the TTL and silences their emitters", () => {
    const now = 1_000_000;
    const old = createBatch(input(), now - 3_600_001);
    const fresh = createBatch(input(), now);
    const listener = vi.fn();
    subscribe(old.id, listener);

    expect(evictExpired(now, 3_600_000)).toBe(1);
    expect(getBatch(old.id)).toBeUndefined();
    expect(getBatch(fresh.id)).toBeDefined();

    completeBatch(old.id);
    expect(listener).not.toHaveBeenCalled();
  });
});
