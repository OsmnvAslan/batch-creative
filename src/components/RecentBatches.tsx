import Link from "next/link";
import type { BatchSummary } from "@/lib/types";

export default function RecentBatches({ batches }: { batches: BatchSummary[] }) {
  if (batches.length === 0) return null;
  return (
    <section className="mt-14 fade-up">
      <h2 className="mb-4 text-sm font-semibold text-ink-2">Recent batches</h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {batches.map((b) => (
          <li key={b.id}>
            <Link
              href={`/b/${b.id}`}
              className="card flex items-center gap-4 p-3 transition hover:border-line-strong"
            >
              <PreviewStrip urls={b.previewImageUrls.length ? b.previewImageUrls : b.referenceImageUrls} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {b.total} {b.total === 1 ? "product" : "products"}
                  <span className="ml-2 font-mono text-xs font-normal text-ink-3">
                    {b.done} done{b.failed > 0 ? ` · ${b.failed} failed` : ""}
                  </span>
                </p>
                <p className="font-mono text-xs text-ink-3">
                  {new Date(b.createdAt).toLocaleString("en-GB")} ·{" "}
                  <span className={b.status === "complete" ? "text-accent" : "text-warn"}>{b.status}</span>
                </p>
              </div>
              <span className="text-ink-3" aria-hidden>
                →
              </span>
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
          className="h-12 w-12 rounded-md border border-white bg-white object-cover shadow-sm"
          style={{ zIndex: 4 - i }}
        />
      ))}
    </div>
  );
}
