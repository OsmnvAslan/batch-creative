import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-sm text-ink-2">
        This batch doesn&apos;t exist or has expired. Batches are kept for a day.
      </p>
      <Link href="/" className="btn btn-primary mt-6">
        Start a new batch
      </Link>
    </main>
  );
}
