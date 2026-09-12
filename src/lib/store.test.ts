import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  completeBatch,
  createBatch,
  evictExpired,
  getBatch,
  resetStore,
  setStyle,
  subscribe,
  updateJob,
} from "./store";
import type { StreamEvent } from "./types";

const job = (id: string) => ({ id, productName: `${id}.jpg`, status: "pending" as const, attempts: 0 });

describe("store", () => {
  beforeEach(() => resetStore());

  it("creates a batch in the preparing state", () => {
    const batch = createBatch([job("a")]);
    expect(batch.status).toBe("preparing");
    expect(batch.styleFingerprint).toBe("");
    expect(getBatch(batch.id)).toBe(batch);
  });

  it("emits style, job and done events in order to subscribers", () => {
    const batch = createBatch([job("a")]);
    const events: StreamEvent[] = [];
    const unsubscribe = subscribe(batch.id, (e) => events.push(e));
    expect(unsubscribe).toBeTypeOf("function");

    setStyle(batch.id, "warm light");
    updateJob(batch.id, "a", { status: "running" });
    updateJob(batch.id, "a", { status: "done", imageDataUrl: "data:x", attempts: 1 });
    completeBatch(batch.id);

    expect(events.map((e) => e.type)).toEqual(["style", "job", "job", "done"]);
    expect(getBatch(batch.id)?.status).toBe("complete");
    expect(getBatch(batch.id)?.jobs[0]).toMatchObject({ status: "done", imageDataUrl: "data:x" });

    unsubscribe?.();
    updateJob(batch.id, "a", { attempts: 9 });
    expect(events).toHaveLength(4);
  });

  it("ignores updates for unknown batches or jobs", () => {
    const batch = createBatch([job("a")]);
    updateJob("nope", "a", { status: "running" });
    updateJob(batch.id, "nope", { status: "running" });
    expect(getBatch(batch.id)?.jobs[0].status).toBe("pending");
    expect(subscribe("nope", () => {})).toBeUndefined();
  });

  it("evicts batches older than the TTL", () => {
    const now = 1_000_000;
    const old = createBatch([job("a")], now - 3_600_001);
    const fresh = createBatch([job("b")], now);
    const listener = vi.fn();
    subscribe(old.id, listener);

    expect(evictExpired(now, 3_600_000)).toBe(1);
    expect(getBatch(old.id)).toBeUndefined();
    expect(getBatch(fresh.id)).toBeDefined();

    completeBatch(old.id); // no-op, no emit
    expect(listener).not.toHaveBeenCalled();
  });
});
