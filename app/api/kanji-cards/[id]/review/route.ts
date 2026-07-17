import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { isEarly, schedule, KANJI_TUNING, type Grade } from "@/lib/srs";
import { readSrs } from "@/lib/decks";

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
    .eq("active", true)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const reviewedAt = Date.now();
  const prev = readSrs(card, "word"); // kanji_cards use the base SRS column names
  const applySchedule = !(practice && isEarly(prev, reviewedAt));
  const scheduled = applySchedule
    ? schedule(prev, grade, reviewedAt, KANJI_TUNING)
    : {
        next: prev,
        log: {
          interval_before: prev.interval_days,
          interval_after: prev.interval_days,
          ease_after: prev.ease,
          elapsed_days: prev.last_reviewed_at
            ? (reviewedAt - Date.parse(prev.last_reviewed_at)) / 86_400_000
            : null,
        },
      };
  const { next, log } = scheduled;

  // The RPC locks the card and commits the schedule + review log atomically.
  const { data: updated, error: commitError } = await auth.supabase
    .rpc("commit_kanji_card_review", {
      p_card_id: id,
      p_expected_last_reviewed_at: prev.last_reviewed_at,
      p_apply_schedule: applySchedule,
      p_ease: next.ease,
      p_interval_days: next.interval_days,
      p_reps: next.reps,
      p_lapses: next.lapses,
      p_state: next.state,
      p_due_at: next.due_at,
      p_last_reviewed_at: next.last_reviewed_at,
      p_grade: grade,
      p_interval_before: log.interval_before,
      p_interval_after: log.interval_after,
      p_ease_after: log.ease_after,
      p_elapsed_days: log.elapsed_days,
      p_reviewed_at: new Date(reviewedAt).toISOString(),
    })
    .maybeSingle();
  if (commitError) {
    const conflict = commitError.code === "40001";
    return NextResponse.json(
      { error: commitError.message },
      { status: conflict ? 409 : 500 }
    );
  }
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ data: updated });
}
