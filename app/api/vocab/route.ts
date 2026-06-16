import { NextResponse } from "next/server";
import { supabase, VOCAB_TABLE } from "@/lib/supabase";
import type { VocabInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vocab — list all vocab, newest first.
export async function GET() {
  const { data, error } = await supabase
    .from(VOCAB_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

function sanitize(v: Partial<VocabInput>): VocabInput | null {
  const kanji = (v.kanji ?? "").toString().trim();
  if (!kanji) return null;
  return {
    kanji,
    romaji: v.romaji?.toString().trim() || null,
    english: v.english?.toString().trim() || null,
    tips: v.tips?.toString().trim() || null,
    category: v.category?.toString().trim() || null,
  };
}

// POST /api/vocab — create one ({...}) or many ({ rows: [...] }) records.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = Array.isArray((body as { rows?: unknown[] })?.rows)
    ? ((body as { rows: Partial<VocabInput>[] }).rows)
    : [body as Partial<VocabInput>];

  const rows = incoming
    .map(sanitize)
    .filter((r): r is VocabInput => r !== null);

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows (kanji is required)." },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from(VOCAB_TABLE)
    .insert(rows)
    .select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, inserted: data?.length ?? 0 }, { status: 201 });
}
