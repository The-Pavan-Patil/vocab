import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import type { VocabInput } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/vocab — list the signed-in user's vocab, newest first (RLS-scoped).
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("vocab")
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

// POST /api/vocab — create one ({...}) or many ({ rows: [...] }) records for the
// signed-in user.
export async function POST(request: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const incoming = Array.isArray((body as { rows?: unknown[] })?.rows)
    ? ((body as { rows: Partial<VocabInput>[] }).rows)
    : [body as Partial<VocabInput>];

  const sanitized = incoming
    .map(sanitize)
    .filter((r): r is VocabInput => r !== null);

  if (sanitized.length === 0) {
    return NextResponse.json(
      { error: "No valid rows (kanji is required)." },
      { status: 400 }
    );
  }

  // Skip anything already in this user's list (or repeated within this batch),
  // matched on the trimmed kanji — the same key the import preview dedups on.
  // Without this, re-adding the same dictionary word just stacks duplicates.
  const { data: existing, error: existingError } = await auth.supabase
    .from("vocab")
    .select("kanji");
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  // Stamp each kept row with the owner so it satisfies the RLS insert policy
  // (user_id must equal auth.uid()).
  const seen = new Set((existing ?? []).map((r) => r.kanji as string));
  const rows: (VocabInput & { user_id: string })[] = [];
  let skipped = 0;
  for (const r of sanitized) {
    if (seen.has(r.kanji)) {
      skipped++;
      continue;
    }
    seen.add(r.kanji);
    rows.push({ ...r, user_id: auth.user.id });
  }

  // Everything incoming was already in the list — nothing to insert, but that's
  // a no-op, not an error.
  if (rows.length === 0) {
    return NextResponse.json({ data: [], inserted: 0, skipped }, { status: 200 });
  }

  const { data, error } = await auth.supabase.from("vocab").insert(rows).select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { data, inserted: data?.length ?? 0, skipped },
    { status: 201 }
  );
}
