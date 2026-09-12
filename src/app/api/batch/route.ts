// POST /api/batch — validate the upload, persist the batch, start the work in
// the background and return { batchId, productCount } immediately.

import { NextResponse } from "next/server";
import { startBatch } from "@/lib/orchestrator";
import { clientIp, globalLimiter } from "@/lib/ratelimit";
import {
  validateCounts,
  validateImage,
  ValidationError,
  type UploadedImage,
} from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readImages(files: File[], fallbackLabel: string): Promise<UploadedImage[]> {
  return Promise.all(
    files.map(async (file, i) =>
      validateImage(file.name || `${fallbackLabel} ${i + 1}`, Buffer.from(await file.arrayBuffer())),
    ),
  );
}

export async function POST(req: Request) {
  const limit = globalLimiter().check(clientIp(req));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many batches from this address. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const productFiles = form.getAll("products").filter((v): v is File => v instanceof File);
  const referenceFiles = form.getAll("references").filter((v): v is File => v instanceof File);

  try {
    validateCounts(productFiles.length, referenceFiles.length);
    const [products, references] = await Promise.all([
      readImages(productFiles, "Product"),
      readImages(referenceFiles, "Reference"),
    ]);

    const { batch } = startBatch({ products, references });
    return NextResponse.json({ batchId: batch.id, productCount: batch.jobs.length });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("POST /api/batch failed", err);
    return NextResponse.json({ error: "Failed to start batch" }, { status: 500 });
  }
}
