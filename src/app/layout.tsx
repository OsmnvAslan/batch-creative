import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Batch Creative",
  description:
    "Turn a set of product photos and one reference image into a consistent series of social posts, streamed as they generate.",
};

const REPO_URL = "https://github.com/OsmnvAslan/batch-creative";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-line bg-elev/70 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden />
              Batch Creative
            </Link>
            <nav className="flex items-center gap-4 text-sm text-ink-2">
              <a href={REPO_URL} className="hover:text-ink" target="_blank" rel="noreferrer">
                GitHub ↗
              </a>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mx-auto max-w-5xl px-4 py-10 text-xs text-ink-3">
          Products in, a series of posts out. Image-to-image with Gemini, failover to text-to-image,
          streamed over SSE.
        </footer>
      </body>
    </html>
  );
}
