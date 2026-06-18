import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { newState, schedule, type Grade, type SrsState } from "@/lib/srs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const GRADES: Grade[] = ["remember", "right", "wrong"];

// POST /api/vocab/[id]/review — record a flashcard review.
// Body: { grade: "remember" | "right" | "wrong" }
// Loads the card's current SRS state, computes the next schedule (the server is
// the single source of truth for intervals), persists it, and appends a row to
// the reviews log. Returns the updated card.
export async function POST(request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;

  let body: { grade?: unknown };
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

  // Fetch the card's current scheduling state (RLS scopes this to the owner).
  const { data: card, error: readErr } = await auth.supabase
    .from("vocab")
    .select("ease, interval_days, reps, lapses, state, due_at, last_reviewed_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!card) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Overlay the row onto sane defaults so a pre-migration / partially-populated
  // card is treated as new rather than crashing the scheduler.
  const prev: SrsState = { ...newState(), ...card };
  const { next, log } = schedule(prev, grade, Date.now());

  const { data: updated, error: updErr } = await auth.supabase
    .from("vocab")
    .update({
      ease: next.ease,
      interval_days: next.interval_days,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      due_at: next.due_at,
      last_reviewed_at: next.last_reviewed_at,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Append to the review log. Stamp user_id explicitly to satisfy the RLS insert
  // check. A logging failure shouldn't fail the review, so we don't block on it.
  const { error: logErr } = await auth.supabase.from("reviews").insert({
    vocab_id: id,
    user_id: auth.user.id,
    grade,
    interval_before: log.interval_before,
    interval_after: log.interval_after,
    ease_after: log.ease_after,
    elapsed_days: log.elapsed_days,
  });
  if (logErr) {
    // Surface it in logs but still return success — the card itself is scheduled.
    console.error("reviews insert failed:", logErr.message);
  }

  return NextResponse.json({ data: updated });
}
