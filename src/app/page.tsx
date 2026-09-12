"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProductJob, StreamEvent } from "@/lib/types";
import UploadArea, { type SelectedFile } from "@/components/UploadArea";
import ResultCard from "@/components/ResultCard";

type Phase = "idle" | "submitting" | "streaming" | "complete";

export default function Page() {
  const [products, setProducts] = useState<SelectedFile[]>([]);
  const [references, setReferences] = useState<SelectedFile[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [jobs, setJobs] = useState<ProductJob[]>([]);
  const [styleFingerprint, setStyleFingerprint] = useState<string>("");
  const [fingerprintOpen, setFingerprintOpen] = useState(false);
  const [connectionNote, setConnectionNote] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);
  const filesRef = useRef<{ products: SelectedFile[]; references: SelectedFile[] }>({
    products: [],
    references: [],
  });
  useEffect(() => {
    filesRef.current = { products, references };
  }, [products, references]);

  // Release object URLs + close the stream on unmount.
  useEffect(() => {
    return () => {
      esRef.current?.close();
      const { products, references } = filesRef.current;
      products.forEach((p) => URL.revokeObjectURL(p.url));
      references.forEach((r) => URL.revokeObjectURL(r.url));
    };
  }, []);

  // ---- file selection helpers ----
  const addProducts = (files: File[]) => {
    setValidationError(null);
    setProducts((prev) => [
      ...prev,
      ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  };

  const addReferences = (files: File[]) => {
    setReferences((prev) => {
      const next = [
        ...prev,
        ...files.map((file) => ({ file, url: URL.createObjectURL(file) })),
      ];
      if (next.length > 2) {
        setValidationError("At most 2 reference images are allowed.");
      } else {
        setValidationError(null);
      }
      return next;
    });
  };

  const removeProduct = (index: number) => {
    setProducts((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const removeReference = (index: number) => {
    setReferences((prev) => {
      const item = prev[index];
      if (item) URL.revokeObjectURL(item.url);
      const next = prev.filter((_, i) => i !== index);
      if (next.length <= 2) setValidationError(null);
      return next;
    });
  };

  // SSE: `init` seeds the grid with the full snapshot, `style` fills in the
  // fingerprint, `job` replaces one card, `done` closes. EventSource reconnects
  // on its own after a drop and the server re-sends a full snapshot, so no
  // client-side reconnect bookkeeping is needed.
  const openStream = useCallback((batchId: string) => {
    esRef.current?.close();
    const es = new EventSource(`/api/batch/${batchId}/stream`);
    esRef.current = es;

    es.onmessage = (e) => {
      let evt: StreamEvent;
      try {
        evt = JSON.parse(e.data) as StreamEvent;
      } catch {
        return;
      }

      switch (evt.type) {
        case "init":
          setStyleFingerprint(evt.batch.styleFingerprint);
          setJobs(evt.batch.jobs);
          setPhase(evt.batch.status === "complete" ? "complete" : "streaming");
          setConnectionNote(null);
          break;
        case "style":
          setStyleFingerprint(evt.styleFingerprint);
          break;
        case "job": {
          const job = evt.job;
          setJobs((prev) => prev.map((j) => (j.id === job.id ? job : j)));
          break;
        }
        case "done":
          setPhase("complete");
          es.close();
          if (esRef.current === es) esRef.current = null;
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
  }, []);

  // ---- submit ----
  const handleSubmit = async () => {
    if (products.length < 1) {
      setValidationError("Add at least one product image.");
      return;
    }
    if (references.length < 1 || references.length > 2) {
      setValidationError("Add 1 or 2 reference images.");
      return;
    }

    setValidationError(null);
    setPhase("submitting");
    setConnectionNote(null);

    const fd = new FormData();
    products.forEach((p) => fd.append("products", p.file));
    references.forEach((r) => fd.append("references", r.file));

    try {
      const res = await fetch("/api/batch", { method: "POST", body: fd });
      if (!res.ok) {
        let msg = `Request failed (${res.status})`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) msg = body.error;
        } catch {
          /* ignore */
        }
        setValidationError(msg);
        setPhase("idle");
        return;
      }

      const data = (await res.json()) as {
        batchId: string;
        productCount: number;
      };

      // Optimistic seed so cards appear before the init event arrives.
      setJobs(
        products.map((p, i) => ({
          id: `local-${i}`,
          productName: p.file.name || `Product ${i + 1}`,
          status: "pending",
          attempts: 0,
        }))
      );
      setPhase("streaming");
      openStream(data.batchId);
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : "Network error submitting batch."
      );
      setPhase("idle");
    }
  };

  // ---- reset for a new batch ----
  const handleReset = () => {
    esRef.current?.close();
    esRef.current = null;
    products.forEach((p) => URL.revokeObjectURL(p.url));
    references.forEach((r) => URL.revokeObjectURL(r.url));
    setProducts([]);
    setReferences([]);
    setJobs([]);
    setStyleFingerprint("");
    setFingerprintOpen(false);
    setConnectionNote(null);
    setValidationError(null);
    setPhase("idle");
  };

  // ---- batch-level counts ----
  const total = jobs.length;
  const done = jobs.filter((j) => j.status === "done").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const terminal = done + failed;
  const showResults = phase === "streaming" || phase === "complete";

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="mb-10 animate-float-in">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
          Batch Creative Engine
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          <span className="gradient-text">Products → styled social posts</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
          Drop in product shots + a reference style. The engine fans out one AI
          social post per product — styled to match, streamed to the grid the
          instant each one lands.
        </p>
      </header>

      {!showResults ? (
        <UploadArea
          products={products}
          references={references}
          onAddProducts={addProducts}
          onAddReferences={addReferences}
          onRemoveProduct={removeProduct}
          onRemoveReference={removeReference}
          onSubmit={handleSubmit}
          submitting={phase === "submitting"}
          validationError={validationError}
        />
      ) : (
        <section className="space-y-5 animate-float-in">
          {/* Batch status line */}
          <div className="neon-border flex flex-wrap items-center justify-between gap-3 rounded-2xl glass px-5 py-4">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span
                className={`inline-flex items-center gap-2 font-semibold ${
                  phase === "complete" ? "text-emerald-300" : "text-cyan-300"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    phase === "complete"
                      ? "bg-emerald-400 glow-cyan"
                      : "bg-cyan-400 pulse-ring"
                  }`}
                />
                {phase === "complete" ? "Batch complete" : "Generating"}
              </span>
              <span className="font-mono text-slate-300">
                {terminal}
                <span className="text-slate-500">/{total}</span> done
                {failed > 0 && (
                  <span className="text-rose-400"> · {failed} failed</span>
                )}
              </span>
              {/* mini progress bar */}
              <span className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-white/10 sm:block">
                <span
                  className="block h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 transition-all duration-500"
                  style={{ width: total ? `${(terminal / total) * 100}%` : "0%" }}
                />
              </span>
            </div>

            {phase === "complete" && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:text-cyan-200"
              >
                ↻ New batch
              </button>
            )}
          </div>

          {connectionNote && (
            <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
              {connectionNote}
            </p>
          )}

          {/* Shared style fingerprint (consistency, collapsible) */}
          {styleFingerprint && (
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
                <span className="text-slate-500">
                  {fingerprintOpen ? "▲" : "▼"}
                </span>
              </button>
              {fingerprintOpen && (
                <p className="border-t border-white/10 px-5 py-4 font-mono text-xs leading-relaxed text-slate-400">
                  {styleFingerprint}
                </p>
              )}
            </div>
          )}

          {/* Result grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job, i) => (
              <div
                key={job.id}
                className="animate-float-in"
                style={{ animationDelay: `${Math.min(i * 70, 500)}ms` }}
              >
                <ResultCard job={job} />
              </div>
            ))}
          </div>
        </section>
      )}

    </main>
  );
}
