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
        setConnectionNote("Connection lost — reconnecting…");
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

  return (
    <section className="space-y-5 animate-float-in">
      <div className="neon-border flex flex-wrap items-center justify-between gap-3 rounded-2xl glass px-5 py-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span
            className={`inline-flex items-center gap-2 font-semibold ${
              complete ? "text-emerald-300" : "text-cyan-300"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                complete ? "bg-emerald-400 glow-cyan" : "bg-cyan-400 pulse-ring"
              }`}
            />
            {complete ? "Batch complete" : batch.status === "preparing" ? "Reading the reference" : "Generating"}
          </span>
          <span className="font-mono text-slate-300">
            {terminal}
            <span className="text-slate-500">/{total}</span> done
            {failed > 0 && <span className="text-rose-400"> · {failed} failed</span>}
          </span>
          <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-white/10 sm:block">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 transition-all duration-500"
              style={{ width: total ? `${(terminal / total) * 100}%` : "0%" }}
            />
          </span>
        </div>

        <div className="flex items-center gap-3">
          <ReferenceStrip urls={batch.referenceImageUrls} />
          <Link
            href="/"
            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200"
          >
            ↻ New batch
          </Link>
        </div>
      </div>

      {connectionNote && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
          {connectionNote}
        </p>
      )}

      {batch.styleFingerprint && (
        <div className="overflow-hidden rounded-2xl glass">
          <button
            type="button"
            onClick={() => setFingerprintOpen((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-slate-200 transition hover:text-cyan-200"
          >
            <span className="inline-flex items-center gap-2">
              <span className="text-cyan-400">◈</span> Shared style fingerprint
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-200">
                reused on every post
              </span>
            </span>
            <span className="text-slate-500">{fingerprintOpen ? "▲" : "▼"}</span>
          </button>
          {fingerprintOpen && (
            <p className="border-t border-white/10 px-5 py-4 font-mono text-xs leading-relaxed text-slate-400">
              {batch.styleFingerprint}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {batch.jobs.map((job: ProductJob, i) => (
          <div key={job.id} className="animate-float-in" style={{ animationDelay: `${Math.min(i * 70, 500)}ms` }}>
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
    <div className="flex items-center gap-1.5" title="Reference images">
      <span className="font-mono text-[10px] uppercase tracking-wider text-fuchsia-300">ref</span>
      {urls.map((u) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={u} src={u} alt="Reference" className="h-9 w-9 rounded-lg border border-white/15 object-cover" />
      ))}
    </div>
  );
}
