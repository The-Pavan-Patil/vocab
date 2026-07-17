import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { isEarly, schedule, KANJI_TUNING, WORD_TUNING, type Grade } from "@/lib/srs";
import { readSrs, type StudyMode } from "@/lib/decks";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const GRADES: Grade[] = ["remember", "right", "wrong"];

// POST /api/vocab/[id]/review — record a flashcard review.
// Body: { grade: "remember" | "right" | "wrong", practice?: boolean, mode?: "word" | "kanji" }
// Loads the card's current SRS state for the chosen deck (the server is the
// single source of truth for intervals), computes + persists the next schedule
// to that deck's columns, and appends a row to the reviews log. Returns the
// updated card. `mode` selects the word track or the independent kanji track.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;

  let body: { grade?: unknown; practice?: unknown; mode?: unknown };
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
  // A cram ("Study again") review of a not-yet-due card. We honor it only when
  // the card really isn't due yet (checked below against the server clock).
  const practice = body.practice === true;
  // Which deck this review belongs to — picks the column set + tuning + log mode.
  const mode: StudyMode = body.mode === "kanji" ? "kanji" : "word";
  const tuning = mode === "kanji" ? KANJI_TUNING : WORD_TUNING;

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

  // Read THIS deck's SRS state (kanji_* columns for the kanji deck), overlaying
  // sane defaults so a pre-migration / partially-populated row is treated as new.
  const prev = readSrs(card, mode);

  const applySchedule = !(practice && isEarly(prev, reviewedAt));
  const scheduled = applySchedule
    ? schedule(prev, grade, reviewedAt, tuning)
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
