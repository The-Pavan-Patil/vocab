import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { isEarly, schedule, KANJI_TUNING, type Grade } from "@/lib/srs";
import { readSrs, writeSrs } from "@/lib/decks";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const GRADES: Grade[] = ["remember", "right", "wrong"];

// POST /api/kanji-cards/[id]/review — record a smart-deck (kanji-in-word) review.
// Body: { grade, practice? }. Reuses the SM-2 scheduler with KANJI_TUNING; the
// kanji_cards SRS columns use base names, so readSrs/writeSrs("word") apply.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;

  let body: { grade?: unknown; practice?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const grade = body.grade as Grade;
  if (!GRADES.includes(grade)) {
    return NextResponse.json(
      { error: `grade must be one of: ${GRADES.join(", ")}` },
      { status: 400 }
    );
  }
  const practice = body.practice === true;

  const { data: card, error: readErr } = await auth.supabase
    .from("kanji_cards")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reviewedAt = Date.now();
  const prev = readSrs(card, "word"); // kanji_cards use the base SRS column names

  // Practice (cram) review of a not-yet-due card: log it, leave the schedule.
  if (practice && isEarly(prev, reviewedAt)) {
    const elapsed_days = prev.last_reviewed_at
      ? (reviewedAt - Date.parse(prev.last_reviewed_at)) / 86_400_000
      : null;
    const { error: logErr } = await auth.supabase.from("reviews").insert({
      kanji_card_id: id,
      user_id: auth.user.id,
      grade,
      mode: "kanji_char",
      interval_before: prev.interval_days,
      interval_after: prev.interval_days,
      ease_after: prev.ease,
      elapsed_days,
    });
    if (logErr) console.error("reviews insert failed:", logErr.message);
    return NextResponse.json({ data: card });
  }

  const { next, log } = schedule(prev, grade, reviewedAt, KANJI_TUNING);

  const { data: updated, error: updErr } = await auth.supabase
    .from("kanji_cards")
    .update(writeSrs(next, "word"))
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error: logErr } = await auth.supabase.from("reviews").insert({
    kanji_card_id: id,
    user_id: auth.user.id,
    grade,
    mode: "kanji_char",
    interval_before: log.interval_before,
    interval_after: log.interval_after,
    ease_after: log.ease_after,
    elapsed_days: log.elapsed_days,
  });
  if (logErr) console.error("reviews insert failed:", logErr.message);

  return NextResponse.json({ data: updated });
}
