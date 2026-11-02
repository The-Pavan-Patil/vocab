import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { getCachedKanji } from "@/lib/kanjiapi";
import { wordKanjiChars } from "@/lib/kanji-deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/kanji-cards — the signed-in user's Smart / All Kanji cards
// (RLS-scoped), plus `kanji`: cached kanjiapi details for every kanji in the
// cards' words, read in one query so a card's back needs no request per kanji.
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("kanji_cards")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The details are an enrichment: if the cache read fails, the cards still
  // load and their backs fetch the details one kanji at a time.
  let kanji = {};
  try {
    kanji = await getCachedKanji(auth.supabase, wordKanjiChars(data ?? []));
  } catch {
    kanji = {};
  }
  return NextResponse.json({ data, kanji });
}
