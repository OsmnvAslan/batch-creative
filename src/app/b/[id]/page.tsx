import { notFound } from "next/navigation";
import BatchView from "@/components/BatchView";
import { getBatch } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = getBatch(id);
  if (!batch) notFound();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3 fade-up">
        <h1 className="text-2xl font-semibold tracking-tight">
          {batch.jobs.length} {batch.jobs.length === 1 ? "post" : "posts"}
          <span className="ml-3 font-mono text-sm font-normal text-ink-3">{batch.id.slice(0, 8)}</span>
        </h1>
        <p className="font-mono text-xs text-ink-3">{new Date(batch.createdAt).toLocaleString("en-GB")}</p>
      </header>
      <BatchView initial={batch} />
    </main>
  );
}
