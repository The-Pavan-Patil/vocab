import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { syncKanjiCards } from "@/lib/kanji-sync";

export const runtime = "nodejs";

// POST /api/kanji-cards/sync — reconcile the smart deck: ensure a kanji_card
// exists for every kanji in the user's `study_as_kanji` words. Idempotent; safe
// to call after adding words and on deck load. (Uses kanjiapi + kuroshiro, so
// it's intentionally separate from the vocab-add hot path.)
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { data: words, error } = await auth.supabase
    .from("vocab")
    .select("*")
    .eq("study_as_kanji", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const created = await syncKanjiCards(auth.supabase, auth.user.id, words ?? []);
    return NextResponse.json({ created });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
