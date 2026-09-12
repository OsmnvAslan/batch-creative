import { notFound } from "next/navigation";
import Link from "next/link";
import BatchView from "@/components/BatchView";
import { getBatch } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = getBatch(id);
  if (!batch) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 animate-float-in">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300 hover:text-cyan-200"
          >
            ← Batch Creative
          </Link>
          <h1 className="text-3xl font-black tracking-tight">
            <span className="gradient-text">Batch</span>{" "}
            <span className="font-mono text-base font-normal text-slate-500">{batch.id.slice(0, 8)}</span>
          </h1>
        </div>
        <p className="font-mono text-xs text-slate-500">{new Date(batch.createdAt).toLocaleString()}</p>
      </header>
      <BatchView initial={batch} />
    </main>
  );
}
