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

  // Stamp each row with the owner so it satisfies the RLS insert policy
  // (user_id must equal auth.uid()).
  const rows = incoming
    .map(sanitize)
    .filter((r): r is VocabInput => r !== null)
    .map((r) => ({ ...r, user_id: auth.user.id }));

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows (kanji is required)." },
      { status: 400 }
    );
  }

  const { data, error } = await auth.supabase.from("vocab").insert(rows).select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data, inserted: data?.length ?? 0 }, { status: 201 });
}
