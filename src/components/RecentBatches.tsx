import Link from "next/link";
import type { BatchSummary } from "@/lib/types";

export default function RecentBatches({ batches }: { batches: BatchSummary[] }) {
  if (batches.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Recent batches</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {batches.map((b) => (
          <li key={b.id}>
            <Link
              href={`/b/${b.id}`}
              className="flex items-center gap-4 rounded-2xl glass p-3 transition hover:border-cyan-400/40"
            >
              <PreviewStrip urls={b.previewImageUrls.length ? b.previewImageUrls : b.referenceImageUrls} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">
                  {b.total} {b.total === 1 ? "product" : "products"}
                  <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                    {b.done} done{b.failed > 0 ? ` · ${b.failed} failed` : ""}
                  </span>
                </p>
                <p className="font-mono text-xs text-slate-500">
                  {new Date(b.createdAt).toLocaleString()} ·{" "}
                  <span className={b.status === "complete" ? "text-emerald-300" : "text-cyan-300"}>{b.status}</span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PreviewStrip({ urls }: { urls: string[] }) {
  return (
    <div className="flex shrink-0 -space-x-3">
      {urls.slice(0, 4).map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={u}
          src={u}
          alt=""
          className="h-12 w-12 rounded-lg border border-white/15 bg-black/40 object-cover"
          style={{ zIndex: 4 - i }}
        />
      ))}
    </div>
  );
}
