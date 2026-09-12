"use client";

import type { ProductJob } from "@/lib/types";

const CARD = "relative flex flex-col overflow-hidden rounded-2xl glass transition";

function ProductThumb({ job }: { job: ProductJob }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={job.productImageUrl}
      alt={`Original: ${job.productName}`}
      title="Uploaded product"
      className="absolute left-2 top-2 h-12 w-12 rounded-lg border border-white/20 bg-black/40 object-cover shadow-lg"
    />
  );
}

export default function ResultCard({ job }: { job: ProductJob }) {
  if (job.status === "failed") {
    return (
      <div className={`${CARD} border border-rose-500/30`}>
        <div className="relative flex aspect-square items-center justify-center bg-rose-500/5 p-4 text-center">
          <ProductThumb job={job} />
          <span className="text-4xl text-rose-400/80">⚠</span>
        </div>
        <div className="space-y-1 p-4">
          <p className="truncate text-sm font-semibold text-slate-100" title={job.productName}>
            {job.productName}
          </p>
          <p className="break-words text-xs text-rose-300">{job.error ?? "Generation failed"}</p>
          <p className="font-mono text-[11px] text-rose-400/70">attempts: {job.attempts}</p>
        </div>
      </div>
    );
  }

  if (job.status === "done" && job.imageUrl) {
    return (
      <div className={`${CARD} neon-border hover:glow-cyan`}>
        <div className="relative aspect-square overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.imageUrl}
            alt={job.headline ?? job.productName}
            className="h-full w-full object-cover transition duration-700 hover:scale-105"
          />
          <ProductThumb job={job} />
          {job.headline && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-4 pt-10">
              <p className="text-lg font-extrabold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                {job.headline}
              </p>
            </div>
          )}
          <div className="absolute right-2 top-2 flex gap-1.5">
            {job.provider && (
              <span
                className="rounded-full border border-white/10 bg-black/60 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-cyan-200 backdrop-blur"
                title={
                  job.imageConditioned
                    ? "Generated from the product and reference pixels"
                    : "Generated from a text description only"
                }
              >
                {job.provider}
                {job.imageConditioned ? " · img2img" : " · txt2img"}
              </span>
            )}
            <span className="rounded-full border border-white/10 bg-black/60 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-200 backdrop-blur">
              {job.attempts} {job.attempts === 1 ? "try" : "tries"}
            </span>
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1.5">
            {job.caption && <p className="text-sm leading-snug text-slate-200">{job.caption}</p>}
            <p className="truncate font-mono text-xs text-slate-500" title={job.productName}>
              {job.productName}
            </p>
          </div>
          <a
            href={job.imageUrl}
            download={`${job.productName.replace(/\.[a-z0-9]+$/i, "")}-post`}
            className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200"
            title="Download"
          >
            ↓
          </a>
        </div>
      </div>
    );
  }

  const running = job.status === "running";
  return (
    <div className={`${CARD} border border-white/10`}>
      <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-white/[0.02]">
        <div className="absolute inset-0 shimmer opacity-60" />
        {running && (
          <div
            className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent"
            style={{ animation: "scanline 1.8s ease-in-out infinite" }}
          />
        )}
        <ProductThumb job={job} />
        <div className="relative z-10 flex flex-col items-center gap-3">
          {running ? (
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500/30 border-t-cyan-400" />
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
          )}
          <span className="font-mono text-xs uppercase tracking-widest text-slate-400">
            {running ? "generating" : "queued"}
          </span>
        </div>
      </div>
      <div className="p-4">
        <p className="truncate text-sm font-semibold text-slate-200" title={job.productName}>
          {job.productName}
        </p>
        <p className="font-mono text-xs text-slate-500">{running ? "rendering…" : "in queue"}</p>
      </div>
    </div>
  );
}
