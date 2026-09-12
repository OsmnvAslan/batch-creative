import UploadForm from "@/components/UploadForm";
import RecentBatches from "@/components/RecentBatches";
import { listBatches } from "@/lib/store";
import { maxProducts } from "@/lib/validation";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const recent = listBatches(8);
  const imageToImage = Boolean(process.env.GEMINI_API_KEY);

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <section className="fade-up mb-10 max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          One reference. Every product. Same look.
        </h1>
        <p className="mt-4 text-base text-ink-2 sm:text-lg">
          Upload product photos and a reference image that sets the mood. Each product comes back as
          a social post in that style, with a headline and caption, appearing on the page the moment
          it&apos;s ready.
        </p>
        {!imageToImage && (
          <p className="mt-4 inline-flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <span aria-hidden>⚠</span>
            <span>
              Running without <code className="font-mono">GEMINI_API_KEY</code>: posts are generated
              from text only, so the uploaded pixels don&apos;t influence the result. Fine for a dry run.
            </span>
          </p>
        )}
      </section>

      <UploadForm maxProducts={maxProducts()} />
      <RecentBatches batches={recent} />
    </main>
  );
}
