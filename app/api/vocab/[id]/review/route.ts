import { NextResponse } from "next/server";
import { requireReviewSession } from "@/lib/supabase/require-user";
import { isEarly, schedule, type Grade } from "@/lib/srs";
import { DECK_TUNING, readSrs, vocabDeckFromMode } from "@/lib/decks";
import { isReviewId } from "@/lib/review-command";
import { withServerTiming } from "@/lib/server-timing";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const GRADES: Grade[] = ["remember", "right", "wrong"];

// POST /api/vocab/[id]/review — record a flashcard review.
// Body: { reviewId, grade: "remember" | "right" | "wrong",
//         practice?: boolean, mode?: "word" | "kanji" }
// Loads the card's current SRS state for the chosen deck (the server is the
// single source of truth for intervals), computes + persists the next schedule
// to that deck's columns, and appends a row to the reviews log. Returns the
// updated card. `mode` selects the Vocab deck ("word") or the Word Kanji deck
// ("kanji") — two independent schedules on the same row (lib/decks.ts).
export const POST = withServerTiming(async function POST(request: Request, { params }: Params) {
  const auth = await requireReviewSession();
  if ("response" in auth) return auth.response;

  const { id } = await params;

  let body: {
    grade?: unknown;
    practice?: unknown;
    mode?: unknown;
    reviewId?: unknown;
  };
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
  if (!isReviewId(body.reviewId)) {
    return NextResponse.json(
      { error: "reviewId must be a valid UUID" },
      { status: 400 }
    );
  }
  const reviewId = body.reviewId;
  // `practice` (a cram review of a not-yet-due card) is advisory only — see
  // applySchedule below.
  // Which deck this review belongs to — picks the column set + tuning + log mode.
  const deck = vocabDeckFromMode(body.mode);
  const mode = deck === "word-kanji" ? "kanji" : "word";

  // Fetch the full card row (RLS scopes this to the owner). We select * so the
  // practice path can return the unchanged card with all its display fields.
  const { data: card, error: readErr } = await auth.supabase
    .from("vocab")
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

  // Read THIS deck's SRS state (kanji_* columns for Word Kanji), overlaying
  // sane defaults so a pre-migration / partially-populated row is treated as new.
  const prev = readSrs(card, deck);

  // A card that isn't due yet by the server's clock is a practice rep: logged,
  // schedule untouched, so early reviews can't inflate its interval. That
  // covers cramming ("Study again"), and also a card shown from stale data —
  // already reviewed on another device — whose client still thinks it's due
  // and so doesn't send `practice`. The server's clock decides, not the flag.
  const applySchedule = !isEarly(prev, reviewedAt);
  const scheduled = applySchedule
    ? schedule(prev, grade, reviewedAt, DECK_TUNING[deck])
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

  // The RPC locks the row and commits the selected deck's schedule plus its
  // review-history row atomically. A stale concurrent review returns 409.
  const { data: updated, error: commitError } = await auth.supabase
    .rpc("commit_vocab_review", {
      p_vocab_id: id,
      p_mode: mode,
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
      p_client_review_id: reviewId,
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
});
