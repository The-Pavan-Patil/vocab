import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { syncKanjiCards } from "@/lib/kanji-sync";
import { listWords } from "@/lib/supabase/words";
import { timed, withServerTiming } from "@/lib/server-timing";

export const runtime = "nodejs";
// Reconciles every word at once; give a large deck room to finish. 60 s is the
// highest limit every Vercel plan accepts (see app/api/vocab/route.ts).
export const maxDuration = 60;

// POST /api/kanji-cards/sync — full smart-deck reconciliation. Creates or
// refreshes selected cards, activates reselected cards, and deactivates cards
// whose word/character is no longer selected.
export const POST = withServerTiming(async function POST() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let words;
  try {
    words = await listWords(auth.supabase, auth.user.id);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  try {
    const stats = await timed(
      "kanji-sync",
      syncKanjiCards(auth.supabase, auth.user.id, words, { full: true })
    );
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
});
