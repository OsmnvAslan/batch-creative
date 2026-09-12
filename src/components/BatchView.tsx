"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Batch, ProductJob, StreamEvent } from "@/lib/types";
import ResultCard from "@/components/ResultCard";

/**
 * Live view of one batch. Seeded with the server-rendered snapshot, then kept
 * current over SSE: `init` re-seeds, `style` fills in the fingerprint, `job`
 * replaces one card, `done` closes. EventSource reconnects on its own after a
 * drop and the server re-sends a full snapshot, so no reconnect bookkeeping.
 */
export default function BatchView({ initial }: { initial: Batch }) {
  const [batch, setBatch] = useState<Batch>(initial);
  const [fingerprintOpen, setFingerprintOpen] = useState(false);
  const [connectionNote, setConnectionNote] = useState<string | null>(null);

  useEffect(() => {
    if (initial.status === "complete") return;
    const es = new EventSource(`/api/batch/${initial.id}/stream`);

    es.onmessage = (e) => {
      let evt: StreamEvent;
      try {
        evt = JSON.parse(e.data) as StreamEvent;
      } catch {
        return;
      }
      switch (evt.type) {
        case "init":
          setBatch(evt.batch);
          setConnectionNote(null);
          break;
        case "style":
          setBatch((b) => ({ ...b, status: "running", styleFingerprint: evt.styleFingerprint }));
          break;
        case "job": {
          const job = evt.job;
          setBatch((b) => ({ ...b, jobs: b.jobs.map((j) => (j.id === job.id ? job : j)) }));
          break;
        }
        case "done":
          setBatch((b) => ({ ...b, status: "complete" }));
          es.close();
          break;
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CONNECTING) {
        setConnectionNote("Connection lost, reconnecting…");
      } else if (es.readyState === EventSource.CLOSED) {
        setConnectionNote("Connection closed. Refresh to check the batch.");
      }
    };

    return () => es.close();
  }, [initial.id, initial.status]);

  const total = batch.jobs.length;
  const done = batch.jobs.filter((j) => j.status === "done").length;
  const failed = batch.jobs.filter((j) => j.status === "failed").length;
  const terminal = done + failed;
  const complete = batch.status === "complete";
  const statusLabel = complete
    ? "Complete"
    : batch.status === "preparing"
      ? "Reading the reference"
      : "Generating";

  return (
    <section className="space-y-5 fade-up">
      <div className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${complete ? "bg-accent" : "bg-accent pulse-dot"}`}
              aria-hidden
            />
            {statusLabel}
          </span>
          <span className="font-mono text-ink-2">
            {terminal}
            <span className="text-ink-3">/{total}</span>
            {failed > 0 && <span className="text-danger"> · {failed} failed</span>}
          </span>
          <span className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-ink/10 sm:block" aria-hidden>
            <span
              className="block h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: total ? `${(terminal / total) * 100}%` : "0%" }}
            />
          </span>
        </div>

        <div className="flex items-center gap-4">
          <ReferenceStrip urls={batch.referenceImageUrls} />
          <Link href="/" className="btn btn-ghost">
            New batch
          </Link>
        </div>
      </div>

      {connectionNote && (
        <p role="status" className="rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn">
          {connectionNote}
        </p>
      )}

      {batch.styleFingerprint && (
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setFingerprintOpen((v) => !v)}
            aria-expanded={fingerprintOpen}
            className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold hover:bg-ink/[0.03]"
          >
            <span className="inline-flex items-center gap-2">
              Shared style
              <span className="badge bg-accent-soft text-accent">same for every post</span>
            </span>
            <span className="text-ink-3">{fingerprintOpen ? "−" : "+"}</span>
          </button>
          {fingerprintOpen && (
            <p className="border-t border-line px-5 py-4 text-sm leading-relaxed text-ink-2">
              {batch.styleFingerprint}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {batch.jobs.map((job: ProductJob, i) => (
          <div key={job.id} className="fade-up" style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}>
            <ResultCard job={job} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ReferenceStrip({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex items-center gap-2" title="Reference images">
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">ref</span>
      <div className="flex -space-x-2">
        {urls.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={u} src={u} alt="Reference" className="h-9 w-9 rounded-md border border-white object-cover shadow" />
        ))}
      </div>
    </div>
  );
}
