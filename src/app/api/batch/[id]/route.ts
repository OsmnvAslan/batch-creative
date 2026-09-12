// GET /api/batch/[id] — JSON snapshot of a batch (polling fallback / debugging).

import { NextResponse } from "next/server";
import { getBatch } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = getBatch(id);
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json(batch);
}
