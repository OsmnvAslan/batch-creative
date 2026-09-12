import { beforeEach, describe, expect, it } from "vitest";
import { createBatchStream, GET } from "./route";
import { completeBatch, createBatch, resetStore, setStyle, updateJob } from "@/lib/store";
import type { StreamEvent } from "@/lib/types";

const img = (s: string) => ({ bytes: Buffer.from(s), mime: "image/jpeg" });
const newBatch = () => createBatch({ products: [{ name: "a.jpg", image: img("a") }], references: [img("r")] });

/** Read the whole stream and parse the SSE `data:` lines. */
async function drain(stream: ReadableStream<Uint8Array>): Promise<StreamEvent[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice(6)) as StreamEvent);
}

describe("batch SSE stream", () => {
  beforeEach(() => resetStore());

  it("sends init, then live events, then done and closes", async () => {
    const batch = newBatch();
    const stream = createBatchStream(batch.id, new AbortController().signal);
    const reading = drain(stream);

    setStyle(batch.id, "fp");
    updateJob(batch.id, batch.jobs[0].id, { status: "running" });
    updateJob(batch.id, batch.jobs[0].id, { status: "done", image: img("x"), attempts: 1 });
    completeBatch(batch.id);

    const events = await reading;
    expect(events.map((e) => e.type)).toEqual(["init", "style", "job", "job", "done"]);
    expect(events[0]).toMatchObject({ type: "init", batch: { id: batch.id, status: "preparing" } });
  });

  it("replays a full snapshot and done for a batch that already completed", async () => {
    const batch = newBatch();
    setStyle(batch.id, "fp");
    updateJob(batch.id, batch.jobs[0].id, { status: "done", image: img("x"), attempts: 1 });
    completeBatch(batch.id);

    const events = await drain(createBatchStream(batch.id, new AbortController().signal));
    expect(events.map((e) => e.type)).toEqual(["init", "done"]);
    expect(events[0]).toMatchObject({ batch: { status: "complete", jobs: [{ status: "done" }] } });
  });

  it("closes without events when the client aborts before init", async () => {
    const batch = newBatch();
    const ac = new AbortController();
    ac.abort();
    const events = await drain(createBatchStream(batch.id, ac.signal));
    expect(events).toEqual([]);
  });

  it("stops forwarding after the client aborts", async () => {
    const batch = newBatch();
    const ac = new AbortController();
    const stream = createBatchStream(batch.id, ac.signal);
    const reading = drain(stream);
    setStyle(batch.id, "fp");
    ac.abort();
    updateJob(batch.id, batch.jobs[0].id, { status: "running" });
    const events = await reading;
    expect(events.map((e) => e.type)).toEqual(["init", "style"]);
  });

  it("GET returns 404 for an unknown batch and an event-stream for a known one", async () => {
    const missing = await GET(new Request("http://x/api/batch/nope/stream"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(missing.status).toBe(404);

    const batch = newBatch();
    completeBatch(batch.id);
    const res = await GET(new Request(`http://x/api/batch/${batch.id}/stream`), {
      params: Promise.resolve({ id: batch.id }),
    });
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    const events = await drain(res.body!);
    expect(events.map((e) => e.type)).toEqual(["init", "done"]);
  });
});
