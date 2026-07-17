import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import type { Vocab, VocabInput } from "@/lib/types";
import {
  selectionForWord,
  validateKanjiSelection,
} from "@/lib/kanji-selection";
import { syncKanjiCards } from "@/lib/kanji-sync";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/vocab/[id] — update editable fields of one of the user's records.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  let body: Partial<VocabInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Load the current word first so a selection-only PATCH can be validated
  // against it, and a rename can remove characters no longer present.
  const { data: current, error: currentError } = await auth.supabase
    .from("vocab")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (currentError) {
    return NextResponse.json({ error: currentError.message }, { status: 500 });
  }
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const update: Record<string, string | boolean | string[] | null> = {};
  for (const key of ["kanji", "romaji", "english", "tips", "category"] as const) {
    if (key in body) {
      const val = body[key]?.toString().trim() ?? "";
      update[key] = key === "kanji" ? val : val || null;
    }
  }
  // Boolean opt-in for the kanji deck — kept out of the string-trim loop above.
  if (typeof body.study_as_kanji === "boolean") {
    update.study_as_kanji = body.study_as_kanji;
  }
  const nextWord = (update.kanji as string | undefined) ?? current.kanji;
  // An explicit array replaces the curated set; null restores the default of all
  // JLPT-graded kanji. Invalid or unrelated characters are rejected.
  if ("kanji_selection" in body) {
    const result = validateKanjiSelection(nextWord, body.kanji_selection);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    update.kanji_selection = result.selection;
  } else if ("kanji" in body && current.kanji_selection !== null) {
    // Direct API clients may rename without sending a new selection. Retain only
    // selected characters that still exist in the renamed word.
    update.kanji_selection = selectionForWord(
      nextWord,
      current.kanji_selection
    );
  }
  if (update.kanji === "") {
    return NextResponse.json({ error: "Kanji cannot be empty." }, { status: 400 });
  }

  // RLS limits this to the user's own rows; another user's id matches nothing.
  const { data, error } = await auth.supabase
    .from("vocab")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let syncWarning: string | null = null;
  try {
    await syncKanjiCards(auth.supabase, auth.user.id, [data as Vocab]);
  } catch (syncError) {
    syncWarning = (syncError as Error).message;
  }
  return NextResponse.json({ data: data as Vocab, sync_warning: syncWarning });
}

// DELETE /api/vocab/[id] — remove one of the user's records.
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { error } = await auth.supabase.from("vocab").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
