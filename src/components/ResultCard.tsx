"use client";

import type { ProductJob } from "@/lib/types";

function ProductThumb({ job }: { job: ProductJob }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={job.productImageUrl}
      alt={`Uploaded product: ${job.productName}`}
      title="Uploaded product"
      className="absolute left-3 top-3 h-12 w-12 rounded-md border border-white/70 bg-white object-cover shadow-md"
    />
  );
}

function Attempts({ n }: { n: number }) {
  if (n <= 1) return null;
  return (
    <span className="badge bg-black/55 text-white backdrop-blur" title="Generation attempts across providers">
      {n} tries
    </span>
  );
}

export default function ResultCard({ job }: { job: ProductJob }) {
  if (job.status === "failed") {
    return (
      <article className="card overflow-hidden">
        <div className="relative flex aspect-square items-center justify-center bg-danger-soft">
          <ProductThumb job={job} />
          <span className="text-3xl text-danger" aria-hidden>
            ⚠
          </span>
        </div>
        <div className="space-y-1 p-4">
          <p className="truncate text-sm font-semibold" title={job.productName}>
            {job.productName}
          </p>
          <p className="break-words text-xs text-danger">{job.error ?? "Generation failed"}</p>
          <p className="font-mono text-[11px] text-ink-3">attempts: {job.attempts}</p>
        </div>
      </article>
    );
  }

  if (job.status === "done" && job.imageUrl) {
    return (
      <article className="card group overflow-hidden">
        <div className="relative aspect-square overflow-hidden bg-ink/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={job.imageUrl}
            alt={job.headline ?? job.productName}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          />
          <ProductThumb job={job} />
          {job.headline && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-12">
              <p className="text-lg font-semibold leading-tight text-white drop-shadow">{job.headline}</p>
            </div>
          )}
          <div className="absolute right-3 top-3 flex gap-1.5">
            {job.provider && (
              <span
                className="badge bg-black/55 text-white backdrop-blur"
                title={
                  job.imageConditioned
                    ? "Generated from the product and reference pixels"
                    : "Generated from a text description only"
                }
              >
                {job.provider} · {job.imageConditioned ? "img2img" : "txt2img"}
              </span>
            )}
            <Attempts n={job.attempts} />
          </div>
        </div>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0 space-y-1">
            {job.caption && <p className="text-sm leading-snug text-ink">{job.caption}</p>}
            <p className="truncate font-mono text-xs text-ink-3" title={job.productName}>
              {job.productName}
            </p>
          </div>
          <a
            href={job.imageUrl}
            download={`${job.productName.replace(/\.[a-z0-9]+$/i, "")}-post`}
            className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
            title="Download image"
          >
            Download
          </a>
        </div>
      </article>
    );
  }

  const running = job.status === "running";
  return (
    <article className="card overflow-hidden">
      <div className="relative flex aspect-square items-center justify-center overflow-hidden">
        <div className="skeleton absolute inset-0" />
        <ProductThumb job={job} />
        <div className="relative flex flex-col items-center gap-3">
          {running ? (
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink/15 border-t-accent" />
          ) : (
            <span className="h-2 w-2 rounded-full bg-ink-3" />
          )}
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-3">
            {running ? "generating" : "queued"}
          </span>
        </div>
      </div>
      <div className="p-4">
        <p className="truncate text-sm font-semibold" title={job.productName}>
          {job.productName}
        </p>
        <p className="font-mono text-xs text-ink-3">{running ? "rendering…" : "waiting for a slot"}</p>
      </div>
    </article>
  );
}
