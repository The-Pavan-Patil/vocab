import { NextResponse } from "next/server";
import { supabase, VOCAB_TABLE } from "@/lib/supabase";
import { buildDocx } from "@/lib/export-docx";
import type { Vocab } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export/docx — download the full vocab list as a Word document.
export async function GET() {
  const { data, error } = await supabase
    .from(VOCAB_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const buffer = await buildDocx((data ?? []) as Vocab[]);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": 'attachment; filename="japanese-vocab.docx"',
    },
  });
}
