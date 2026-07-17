// ---------------------------------------------------------------------------
// Spaced-repetition scheduler.
//
// Pure, dependency-free, and ISOMORPHIC: imported by the server route handler
// (`schedule`, the source of truth for intervals) AND by the client Flashcards
// component (`buildSession`, `isDue`, the `Grade` type). Keep it free of any
// node-only or browser-only imports so both sides can use it.
//
// Algorithm: SM-2 (SuperMemo 2) adapted for a THREE-grade input. Classic SM-2
// grades recall on a 0–5 quality scale; our UI only produces three signals, so
// we collapse the scale to the three that matter for our UX:
//
//   "remember" — user pressed “Remember” on the FRONT without flipping
//                (confident recall)            → strong pass  ≈ SM-2 q5
//   "right"    — user flipped, then confirmed they actually had it right
//                (flipped only to double-check) → normal pass  ≈ SM-2 q4
//   "wrong"    — user flipped because they did NOT remember
//                (a lapse)                      → fail         ≈ SM-2 q2
//
// The "right" vs "remember" split is the refinement that lets us tell a
// *confirming* flip apart from a *forgetting* flip — a flip alone is no longer
// assumed to be a failure. See docs/spaced-repetition.md for the full rationale.
//
// The science (why intervals grow on success, collapse on failure):
//   - Forgetting curve (Ebbinghaus): recall probability decays ~exponentially.
//   - Spacing effect: spreading reviews out beats massing them.
//   - Testing effect: the effortful recall attempt IS the learning event.
//   - Desirable difficulty (Bjork): reviewing just before you'd forget gives
//     the biggest durability boost — so each success pushes the next review
//     further out, and each lapse pulls it back in close.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** The three signals the flashcard UI can produce. */
export type Grade = "remember" | "right" | "wrong";

/** Per-card scheduling state. Mirrors the SRS columns on the `vocab` table. */
export type SrsState = {
  ease: number; // multiplier applied to the interval on each success
  interval_days: number; // current gap between reviews, in days
  reps: number; // consecutive successful reviews (0 = new / just lapsed)
  lapses: number; // lifetime count of "wrong" answers
  state: "new" | "review" | "relearning";
  due_at: string | null; // ISO timestamp; null = never reviewed (treated as due now)
  last_reviewed_at: string | null; // ISO timestamp of the previous review
};

// --- Tunable constants ------------------------------------------------------
// These are the canonical SM-2 defaults, lightly adapted for three grades.
// Changing them changes how aggressively gaps grow/shrink. They are gathered
// into a `SrsTuning` object so a deck can be tuned INDEPENDENTLY (the Kanji deck
// uses KANJI_TUNING; the word deck uses WORD_TUNING) while sharing one scheduler.

export const EASE_DEFAULT = 2.5; // starting ease for a brand-new card (both decks)

/** The knobs that shape how one deck's intervals grow and shrink. */
export type SrsTuning = {
  easeMin: number; // floor — stops "hard" cards collapsing to daily forever
  easeMax: number; // ceiling — stops "easy" cards ballooning too fast
  easeDelta: Record<Grade, number>; // how each grade nudges the ease factor
  firstInterval: Record<"remember" | "right", number>; // days on the 1st pass
  secondInterval: number; // days on the 2nd pass (classic SM-2 step)
  maxIntervalDays: number; // hard ceiling — avoids unusable/invalid far-future dates
};

/** Word deck — the canonical SM-2 defaults (unchanged from before). */
export const WORD_TUNING: SrsTuning = {
  easeMin: 1.3,
  easeMax: 2.7,
  easeDelta: { remember: +0.1, right: 0.0, wrong: -0.2 },
  // A confident "remember" earns a slightly longer first gap than a "right".
  firstInterval: { remember: 2, right: 1 },
  secondInterval: 6,
  maxIntervalDays: 36_500,
};

/**
 * Kanji deck — recalling a reading + meaning from the bare glyph is harder, so
 * this is a deliberately MORE CONSERVATIVE starting point: shorter first gaps
 * and a lower ease ceiling, so kanji come back sooner and their gaps grow more
 * slowly. A confident front-side recall still earns a meaningful advantage over
 * a reveal-and-confirm pass.
 */
export const KANJI_TUNING: SrsTuning = {
  easeMin: 1.3,
  easeMax: 2.6,
  easeDelta: { remember: +0.1, right: 0.0, wrong: -0.2 },
  firstInterval: { remember: 2, right: 1 },
  secondInterval: 4,
  maxIntervalDays: 18_250,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** The default SRS state for a brand-new, never-reviewed card. */
export function newState(): SrsState {
  return {
    ease: EASE_DEFAULT,
    interval_days: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    due_at: null,
    last_reviewed_at: null,
  };
}

/** Extra fields worth logging to the `reviews` table for analytics / FSRS later. */
export type ReviewLog = {
  interval_before: number;
  interval_after: number;
  ease_after: number;
  elapsed_days: number | null; // actual days waited since the previous review
};

export type ScheduleResult = { next: SrsState; log: ReviewLog };

/**
 * Compute the next scheduling state for a card given how the user graded it.
 * This is the single source of truth for intervals — the API route calls it and
 * persists `next`; the client never computes intervals itself.
 *
 * @param prev   the card's current SRS state
 * @param grade  the user's signal for this review
 * @param now    current time in epoch ms (pass `Date.now()` at the call site)
 * @param tuning the deck's tuning (defaults to WORD_TUNING; pass KANJI_TUNING
 *               for the kanji deck). The math is identical — only the constants
 *               differ — so both decks share this one source of truth.
 */
export function schedule(
  prev: SrsState,
  grade: Grade,
  now: number,
  tuning: SrsTuning = WORD_TUNING
): ScheduleResult {
  let { ease, interval_days, reps, lapses } = prev;
  const interval_before = interval_days;
  const elapsed_days = prev.last_reviewed_at
    ? (now - Date.parse(prev.last_reviewed_at)) / DAY_MS
    : null;

  let state: SrsState["state"];

  if (grade === "wrong") {
    // Lapse: reset progress so the card resurfaces frequently, and make its
    // future gaps grow more slowly (ease penalty). interval 0 → due immediately,
    // so it reappears today (and within this session, see buildSession/requeue).
    reps = 0;
    lapses += 1;
    ease = clamp(ease + tuning.easeDelta.wrong, tuning.easeMin, tuning.easeMax);
    interval_days = 0;
    state = "relearning";
  } else {
    // Pass: lengthen the gap. First two reps use fixed steps; after that the
    // gap compounds by the ease factor (this is what makes well-known cards
    // appear at exponentially increasing intervals).
    reps += 1;
    if (reps === 1) interval_days = tuning.firstInterval[grade];
    else if (reps === 2) interval_days = tuning.secondInterval;
    else interval_days = Math.round(interval_days * ease);
    interval_days = clamp(interval_days, 1, tuning.maxIntervalDays);
    ease = clamp(ease + tuning.easeDelta[grade], tuning.easeMin, tuning.easeMax);
    state = "review";
  }

  const next: SrsState = {
    ease,
    interval_days,
    reps,
    lapses,
    state,
    due_at: new Date(now + interval_days * DAY_MS).toISOString(),
    last_reviewed_at: new Date(now).toISOString(),
  };

  return {
    next,
    log: {
      interval_before,
      interval_after: interval_days,
      ease_after: ease,
      elapsed_days,
    },
  };
}

// ---------------------------------------------------------------------------
// Session building — which cards to study right now, and in what order.
// Operates on anything carrying SRS fields (the Vocab row), kept generic so it
// doesn't create an import cycle with lib/types.
// ---------------------------------------------------------------------------

type Schedulable = { due_at?: string | null; created_at?: string | null };

/** Default cap on how many never-seen cards to introduce in one session. */
export const NEW_CARDS_PER_SESSION = 100;

/**
 * Session-size choices offered in the UI. `Infinity` = "All new cards" (no cap);
 * `buildSession`'s `fresh.slice(0, Infinity)` already returns every new card.
 */
export const SESSION_SIZE_OPTIONS = [20, 50, 100, Infinity] as const;

/** A card the user has never reviewed (no due date yet). */
export function isNew(card: Schedulable): boolean {
  return card.due_at == null;
}

/** Due time in epoch ms; new cards sort as "due now" via -Infinity. */
function dueTime(card: Schedulable): number {
  return card.due_at == null ? -Infinity : Date.parse(card.due_at);
}

/** Creation time in epoch ms; missing timestamps sort oldest (0). */
function createdTime(card: Schedulable): number {
  return card.created_at ? Date.parse(card.created_at) : 0;
}

/** A reviewed card whose due date has arrived. */
export function isDue(card: Schedulable, now: number): boolean {
  return card.due_at != null && Date.parse(card.due_at) <= now;
}

/**
 * A reviewed card whose next review is still in the future. Reviewing such a
 * card (only possible via cram / "Study again") is an *early* review — see the
 * `practice` path in the review route: an early review is logged but does NOT
 * advance the schedule, so cramming can't inflate intervals.
 */
export function isEarly(card: Schedulable, now: number): boolean {
  return card.due_at != null && Date.parse(card.due_at) > now;
}

/**
 * Build the ordered study queue: every overdue review (most overdue first)
 * followed by up to `newLimit` brand-new cards (oldest-added first). Cards whose
 * next review is in the future are excluded — that's the "all caught up" case.
 *
 * Pass `cram: true` to re-study NOW, ignoring due dates: every reviewed card is
 * included regardless of when it's next due. This backs the "Study again" /
 * restart path — the user explicitly asked to practice again, so we don't make
 * them wait for the schedule. Cram is a practice pass *over* the schedule, not
 * a bypass of it: grading a crammed card still records a real review and moves
 * its due date as usual.
 */
export function buildSession<T extends Schedulable>(
  cards: T[],
  now: number,
  opts: { newLimit?: number; cram?: boolean } = {}
): T[] {
  const { newLimit = NEW_CARDS_PER_SESSION, cram = false } = opts;
  const due: T[] = [];
  const fresh: T[] = [];
  for (const c of cards) {
    if (isNew(c)) fresh.push(c);
    else if (cram || isDue(c, now)) due.push(c);
  }
  due.sort((a, b) => dueTime(a) - dueTime(b));
  // New cards: oldest-added first (FIFO), so words you added long ago aren't
  // starved behind ones you just added when there are more than `newLimit`.
  fresh.sort((a, b) => createdTime(a) - createdTime(b));
  return [...due, ...fresh.slice(0, newLimit)];
}

/**
 * The soonest future due time among cards not in this session — used to tell
 * the user "next review in N hours" on the caught-up screen. Returns null if
 * nothing is scheduled ahead.
 */
export function nextDueAt(cards: Schedulable[], now: number): number | null {
  let soonest: number | null = null;
  for (const c of cards) {
    if (c.due_at == null) continue;
    const t = Date.parse(c.due_at);
    if (t > now && (soonest == null || t < soonest)) soonest = t;
  }
  return soonest;
}

/** How many cards to wait before a lapsed card reappears within a session. */
export const RELEARN_GAP = 5;
