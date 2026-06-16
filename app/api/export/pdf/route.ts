import { NextResponse } from "next/server";
import { supabase, VOCAB_TABLE } from "@/lib/supabase";
import { buildPdf } from "@/lib/export-pdf";
import type { Vocab } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export/pdf — download the full vocab list as a PDF.
export async function GET() {
  const { data, error } = await supabase
    .from(VOCAB_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const buffer = await buildPdf((data ?? []) as Vocab[]);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="japanese-vocab.pdf"',
    },
  });
}
