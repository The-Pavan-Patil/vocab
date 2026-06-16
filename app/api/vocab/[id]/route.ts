import { NextResponse } from "next/server";
import { supabase, VOCAB_TABLE } from "@/lib/supabase";
import type { VocabInput } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/vocab/[id] — update editable fields of one record.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let body: Partial<VocabInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  for (const key of ["kanji", "romaji", "english", "tips", "category"] as const) {
    if (key in body) {
      const val = body[key]?.toString().trim() ?? "";
      update[key] = key === "kanji" ? val : val || null;
    }
  }
  if (update.kanji === "") {
    return NextResponse.json({ error: "Kanji cannot be empty." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(VOCAB_TABLE)
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

// DELETE /api/vocab/[id] — remove one record.
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const { error } = await supabase.from(VOCAB_TABLE).delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
