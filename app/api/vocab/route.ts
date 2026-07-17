import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import type { Vocab, VocabInput } from "@/lib/types";
import { validateKanjiSelection } from "@/lib/kanji-selection";
import { syncKanjiCards } from "@/lib/kanji-sync";

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

function sanitize(
  v: Partial<VocabInput>
): { row: VocabInput | null; error?: string } {
  const kanji = (v.kanji ?? "").toString().trim();
  if (!kanji) return { row: null };
  const studyAsKanji = v.study_as_kanji === true;
  const selection = validateKanjiSelection(kanji, v.kanji_selection);
  if (!selection.ok) return { row: null, error: selection.error };
  const row: VocabInput = {
    kanji,
    romaji: v.romaji?.toString().trim() || null,
    english: v.english?.toString().trim() || null,
    tips: v.tips?.toString().trim() || null,
    category: v.category?.toString().trim() || null,
    study_as_kanji: studyAsKanji, // also drill as a kanji-only card
  };
  // Preserve an explicit set even while the broad toggle is off. Reconciliation
  // marks its cards inactive; re-enabling restores the same cards and schedules.
  if ("kanji_selection" in v) row.kanji_selection = selection.selection;
  return { row };
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

  const updateExisting =
    (body as { update_existing?: unknown })?.update_existing === true;
  const incoming = Array.isArray((body as { rows?: unknown[] })?.rows)
    ? ((body as { rows: Partial<VocabInput>[] }).rows)
    : [body as Partial<VocabInput>];

  const sanitized: VocabInput[] = [];
  for (const source of incoming) {
    const result = sanitize(source);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (result.row) sanitized.push(result.row);
  }

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
    .select("id, kanji");
  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  // Stamp each kept row with the owner so it satisfies the RLS insert policy
  // (user_id must equal auth.uid()).
  const existingByKanji = new Map(
    (existing ?? []).map((r) => [r.kanji as string, r.id as string])
  );
  const seen = new Set(existingByKanji.keys());
  const rows: (VocabInput & { user_id: string })[] = [];
  const updates: { id: string; row: VocabInput }[] = [];
  const queuedUpdates = new Set<string>();
  let skipped = 0;
  for (const row of sanitized) {
    const existingId = existingByKanji.get(row.kanji);
    if (existingId) {
      if (updateExisting && !queuedUpdates.has(existingId)) {
        queuedUpdates.add(existingId);
        updates.push({ id: existingId, row });
      } else {
        skipped++;
      }
      continue;
    }
    if (seen.has(row.kanji)) {
      skipped++;
      continue;
    }
    seen.add(row.kanji);
    rows.push({ ...row, user_id: auth.user.id });
  }

  const updatedRows: Vocab[] = [];
  for (const update of updates) {
    const { data, error } = await auth.supabase
      .from("vocab")
      .update(update.row)
      .eq("id", update.id)
      .select()
      .maybeSingle();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data) updatedRows.push(data as Vocab);
  }

  // Everything incoming was already in the list — nothing to insert, but an
  // optional update may still have been applied.
  if (rows.length === 0) {
    let syncWarning: string | null = null;
    try {
      await syncKanjiCards(auth.supabase, auth.user.id, updatedRows);
    } catch (error) {
      syncWarning = (error as Error).message;
    }
    return NextResponse.json(
      {
        data: updatedRows,
        inserted: 0,
        updated: updatedRows.length,
        skipped,
        sync_warning: syncWarning,
      },
      { status: 200 }
    );
  }

  const { data, error } = await auth.supabase.from("vocab").insert(rows).select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const insertedRows = (data ?? []) as Vocab[];
  let syncWarning: string | null = null;
  try {
    await syncKanjiCards(auth.supabase, auth.user.id, [
      ...updatedRows,
      ...insertedRows,
    ]);
  } catch (syncError) {
    syncWarning = (syncError as Error).message;
  }
  return NextResponse.json(
    {
      data: [...updatedRows, ...insertedRows],
      inserted: insertedRows.length,
      updated: updatedRows.length,
      skipped,
      sync_warning: syncWarning,
    },
    { status: 201 }
  );
}
