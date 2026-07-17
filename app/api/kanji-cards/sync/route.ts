import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { syncKanjiCards } from "@/lib/kanji-sync";

export const runtime = "nodejs";

// POST /api/kanji-cards/sync — full smart-deck reconciliation. Creates or
// refreshes selected cards, activates reselected cards, and deactivates cards
// whose word/character is no longer selected.
export async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { data: words, error } = await auth.supabase
    .from("vocab")
    .select("*");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const stats = await syncKanjiCards(
      auth.supabase,
      auth.user.id,
      words ?? [],
      { full: true }
    );
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
