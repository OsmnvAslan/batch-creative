import UploadForm from "@/components/UploadForm";
import RecentBatches from "@/components/RecentBatches";
import { listBatches } from "@/lib/store";
import { maxProducts } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const recent = listBatches(8);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <header className="mb-10 animate-float-in">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-cyan-300 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" />
          Batch Creative
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          <span className="gradient-text">Products → styled social posts</span>
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400 sm:text-base">
          Drop in product shots and a reference image. Each product becomes a social post in the
          reference&apos;s style, streamed to the page as it finishes.
        </p>
      </header>

      <UploadForm maxProducts={maxProducts()} />
      <RecentBatches batches={recent} />
    </main>
  );
}
