// GET /api/batch/[id]/stream — Server-Sent Events for one batch.
//
// Order on connect: init (full snapshot) -> style? -> job* -> done -> close.
// The listener is attached BEFORE the snapshot is read so nothing emitted in
// between is lost; such events are buffered and flushed right after init.
// A comment line is sent every HEARTBEAT_MS to keep proxies from idling out
// the connection during a long generation.

import { getBatch, subscribe } from "@/lib/store";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

export function createBatchStream(batchId: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | undefined = undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;

      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          close();
        }
      };
      const send = (event: StreamEvent) => write(`data: ${JSON.stringify(event)}\n\n`);

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        signal.removeEventListener("abort", close);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const buffered: StreamEvent[] = [];
      let initSent = false;
      const onEvent = (event: StreamEvent) => {
        if (!initSent) {
          buffered.push(event);
          return;
        }
        send(event);
        if (event.type === "done") close();
      };

      unsubscribe = subscribe(batchId, onEvent);
      if (signal.aborted) return close();
      signal.addEventListener("abort", close);

      const snapshot = getBatch(batchId);
      if (!snapshot) return close();

      send({ type: "init", batch: snapshot });
      initSent = true;

      for (const event of buffered) {
        send(event);
        if (event.type === "done") return close();
      }
      buffered.length = 0;

      if (snapshot.status === "complete") {
        send({ type: "done", batchId });
        return close();
      }

      heartbeat = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);
    },
    cancel() {
      // Consumer went away; the abort listener handles cleanup.
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: batchId } = await params;
  if (!getBatch(batchId)) {
    return Response.json({ error: "Batch not found" }, { status: 404 });
  }

  return new Response(createBatchStream(batchId, req.signal), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
