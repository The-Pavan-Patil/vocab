// Tests for the spaced-repetition scheduler and session builder.
//
// Runs on Node's built-in test runner with native TypeScript type-stripping —
// no test framework or build step required:
//
//   node --test lib/srs.test.ts
//   node --test                       # discovers every *.test.ts
//
// These are characterization tests: they pin down exactly what the scheduler
// does today (so refactors can't silently change behavior) AND encode the
// behaviors flagged in the review (search "REVIEW FINDING") so the concern is
// captured as an executable, reproducible fact rather than prose.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  schedule,
  newState,
  buildSession,
  isNew,
  isDue,
  isEarly,
  nextDueAt,
  EASE_DEFAULT,
  NEW_CARDS_PER_SESSION,
  SESSION_SIZE_OPTIONS,
  RELEARN_GAP,
  WORD_TUNING,
  KANJI_TUNING,
  type SrsState,
} from "./srs.ts";

const DAY = 86_400_000;
// A fixed "now" so nothing depends on the wall clock.
const T = Date.parse("2026-06-27T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

// A reviewed card in a known state, with sensible defaults you can override.
function reviewed(over: Partial<SrsState> = {}): SrsState {
  return {
    ease: 2.5,
    interval_days: 10,
    reps: 3,
    lapses: 0,
    state: "review",
    due_at: iso(T - DAY),
    last_reviewed_at: iso(T - 11 * DAY),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// schedule(): the core SM-2 math — the single source of truth for intervals.
// ---------------------------------------------------------------------------

test("new card + 'right' → 1-day first interval, ease unchanged", () => {
  const { next, log } = schedule(newState(), "right", T);
  assert.equal(next.reps, 1);
  assert.equal(next.interval_days, 1);
  assert.equal(next.ease, 2.5); // "right" leaves ease untouched
  assert.equal(next.state, "review");
  assert.equal(Date.parse(next.due_at!), T + 1 * DAY);
  assert.equal(next.last_reviewed_at, iso(T));
  assert.equal(log.interval_before, 0);
  assert.equal(log.interval_after, 1);
  assert.equal(log.elapsed_days, null); // never reviewed before
});

test("new card + 'remember' → 2-day first interval, ease +0.1", () => {
  const { next } = schedule(newState(), "remember", T);
  assert.equal(next.reps, 1);
  assert.equal(next.interval_days, 2); // confident recall earns a longer first gap
  assert.equal(Number(next.ease.toFixed(2)), 2.6);
  assert.equal(Date.parse(next.due_at!), T + 2 * DAY);
});

test("second successful rep is always 6 days (classic SM-2 step)", () => {
  const afterFirst = schedule(newState(), "right", T).next; // reps 1, interval 1
  const { next } = schedule(afterFirst, "right", T);
  assert.equal(next.reps, 2);
  assert.equal(next.interval_days, 6);
});

test("'right' trajectory compounds by ease after rep 2: 1 → 6 → 15 → 38 → 95", () => {
  let s = newState();
  const seen: number[] = [];
  for (let i = 0; i < 5; i++) {
    s = schedule(s, "right", T).next;
    seen.push(s.interval_days);
  }
  assert.deepEqual(seen, [1, 6, 15, 38, 95]);
});

// --- Per-deck tuning (the Kanji track) -------------------------------------
// The Kanji deck reuses schedule() with KANJI_TUNING — same math, more
// conservative constants: 1–2 day first steps, a 4-day second step, and a lower
// 2.6 ease ceiling, so kanji come back sooner and grow more slowly.

test("KANJI_TUNING: confident recall earns 2 days; reveal-and-confirm earns 1", () => {
  assert.equal(
    schedule(newState(), "remember", T, KANJI_TUNING).next.interval_days,
    2
  );
  assert.equal(
    schedule(newState(), "right", T, KANJI_TUNING).next.interval_days,
    1
  );
});

test("KANJI_TUNING: second pass uses the tighter 4-day step", () => {
  const first = schedule(newState(), "right", T, KANJI_TUNING).next;
  assert.equal(schedule(first, "right", T, KANJI_TUNING).next.interval_days, 4);
});

test("KANJI_TUNING: ease is capped at the lower 2.6 ceiling", () => {
  let s = newState();
  for (let i = 0; i < 6; i++) s = schedule(s, "remember", T, KANJI_TUNING).next;
  assert.equal(s.ease, 2.6);
});

test("intervals are capped before they can create unusable far-future dates", () => {
  const mature = reviewed({ interval_days: 30_000, reps: 20, ease: 2.7 });
  const { next } = schedule(mature, "right", T, WORD_TUNING);
  assert.equal(next.interval_days, WORD_TUNING.maxIntervalDays);
  assert.ok(Number.isFinite(Date.parse(next.due_at!)));
});

test("schedule() with no tuning arg behaves exactly like WORD_TUNING (back-compat)", () => {
  const a = schedule(newState(), "remember", T);
  const b = schedule(newState(), "remember", T, WORD_TUNING);
  assert.deepEqual(a.next, b.next);
  assert.equal(a.next.interval_days, 2); // the word deck's first step is unchanged
});

test("'wrong' resets reps, increments lapses, drops ease, due immediately", () => {
  const prev = reviewed({ interval_days: 95, reps: 5, ease: 2.5 });
  const { next, log } = schedule(prev, "wrong", T);
  assert.equal(next.reps, 0);
  assert.equal(next.lapses, 1);
  assert.equal(Number(next.ease.toFixed(2)), 2.3); // -0.2 penalty
  assert.equal(next.interval_days, 0);
  assert.equal(next.state, "relearning");
  assert.equal(Date.parse(next.due_at!), T); // interval 0 → due now
  assert.equal(log.interval_before, 95);
  assert.equal(log.interval_after, 0);
});

test("ease is clamped to its 2.7 ceiling under repeated 'remember'", () => {
  let s = newState();
  for (let i = 0; i < 6; i++) s = schedule(s, "remember", T).next;
  assert.equal(s.ease, 2.7);
});

test("ease is clamped to its 1.3 floor under repeated 'wrong'", () => {
  let s: SrsState = reviewed({ ease: 2.5 });
  for (let i = 0; i < 10; i++) s = schedule(s, "wrong", T).next;
  assert.equal(s.ease, 1.3);
  assert.equal(s.lapses, 10);
});

test("elapsed_days is measured from the previous review timestamp", () => {
  const prev = reviewed({ last_reviewed_at: iso(T - 3 * DAY) });
  const { log } = schedule(prev, "right", T);
  assert.equal(log.elapsed_days, 3);
});

// schedule() is pure SM-2 and INTENTIONALLY left unchanged: called directly it
// still compounds off rep count (this is what keeps on-time/overdue reviews
// exact). The cram inflation (vocab-6zd) is prevented UPSTREAM instead — the
// review route skips schedule() for early `practice` reviews (gated by isEarly,
// tested below). This test pins that the math itself is untouched.
test("schedule() math is unchanged: a direct call still compounds the interval", () => {
  // Card is at 38 days and only 1 day has actually elapsed since last review.
  const barelyElapsed = reviewed({
    interval_days: 38,
    reps: 4,
    ease: 2.5,
    last_reviewed_at: iso(T - 1 * DAY),
    due_at: iso(T + 37 * DAY), // not due for another 37 days
  });
  const { next, log } = schedule(barelyElapsed, "right", T);
  assert.equal(log.elapsed_days, 1); // only 1 day really passed...
  assert.equal(next.interval_days, 95); // ...but the gap still jumps 38 → 95
});

// A lapse from a mature card discards all interval progress: the very next pass
// starts back at the 1–2 day first step (no sub-day relearning ladder).
test("REVIEW FINDING F: a lapse fully resets — next pass restarts at the first step", () => {
  const mature = reviewed({ interval_days: 95, reps: 5 });
  const lapsed = schedule(mature, "wrong", T).next; // interval 0, reps 0
  const recovered = schedule(lapsed, "right", T).next;
  assert.equal(recovered.reps, 1);
  assert.equal(recovered.interval_days, 1); // 95-day card → back to 1 day
});

// ---------------------------------------------------------------------------
// buildSession(): which cards are shown, and in what order.
// ---------------------------------------------------------------------------

const card = (id: string, due_at: string | null) => ({ id, due_at });

test("due reviews come first (most overdue first), then new cards", () => {
  const dueA = card("a", iso(T - 10 * DAY)); // most overdue
  const dueB = card("b", iso(T - 2 * DAY));
  const future = card("f", iso(T + 5 * DAY)); // not due → excluded
  const new1 = card("n1", null);
  const new2 = card("n2", null);
  const q = buildSession([dueB, dueA, future, new1, new2], T);
  assert.deepEqual(q.map((c) => c.id), ["a", "b", "n1", "n2"]);
});

test("cards due in the future are excluded (the 'all caught up' state)", () => {
  const q = buildSession([card("f", iso(T + DAY))], T);
  assert.deepEqual(q, []);
});

test("new-card introductions are capped at the new limit", () => {
  const many = Array.from({ length: NEW_CARDS_PER_SESSION + 20 }, (_, i) =>
    card(`n${i}`, null)
  );
  assert.equal(buildSession(many, T).length, NEW_CARDS_PER_SESSION);
  assert.equal(buildSession(many, T, { newLimit: 5 }).length, 5);
  // "All new cards" (Infinity) lifts the cap entirely.
  assert.equal(
    buildSession(many, T, { newLimit: Infinity }).length,
    many.length
  );
});

test("overdue reviews are NEVER capped (only new cards are)", () => {
  const due = Array.from({ length: 30 }, (_, i) =>
    card(`d${i}`, iso(T - (i + 1) * DAY))
  );
  assert.equal(buildSession(due, T, { newLimit: 5 }).length, 30);
});

test("cram: true re-includes reviewed cards that are not yet due", () => {
  const future = card("f", iso(T + 5 * DAY));
  const dueA = card("a", iso(T - 10 * DAY));
  const new1 = card("n1", null);
  const q = buildSession([future, dueA, new1], T, { cram: true });
  // future is pulled in; still sorted most-overdue-first; new card last.
  assert.deepEqual(q.map((c) => c.id), ["a", "f", "n1"]);
});

// vocab-4pt FIX — new cards are introduced OLDEST-added first (FIFO), even
// though GET /api/vocab delivers them newest-first. So the oldest words you
// added surface first instead of being starved behind newer ones.
test("vocab-4pt: new cards study oldest-added first, regardless of input order", () => {
  // c0 oldest … c3 newest (larger i → later created_at), delivered newest-first.
  const mk = (i: number) => ({
    id: `c${i}`,
    due_at: null,
    created_at: iso(T - (10 - i) * DAY),
  });
  const newestFirst = [mk(3), mk(2), mk(1), mk(0)];
  const q = buildSession(newestFirst, T, { newLimit: 3 });
  assert.deepEqual(q.map((c) => c.id), ["c0", "c1", "c2"]); // oldest three first
  assert.ok(
    !q.map((c) => c.id).includes("c3"),
    "the NEWEST card is deferred, not the oldest"
  );
});

// ---------------------------------------------------------------------------
// Predicates & helpers.
// ---------------------------------------------------------------------------

test("isNew is true only when there is no due date", () => {
  assert.equal(isNew(card("x", null)), true);
  assert.equal(isNew(card("x", iso(T))), false);
});

test("isDue treats due_at == now as due (inclusive boundary)", () => {
  assert.equal(isDue(card("x", iso(T)), T), true);
  assert.equal(isDue(card("x", iso(T + 1)), T), false);
  assert.equal(isDue(card("x", null), T), false); // new cards aren't "due"
});

test("isEarly: true only for a reviewed card whose due date is still ahead", () => {
  assert.equal(isEarly(card("x", iso(T + DAY)), T), true); // not due yet
  assert.equal(isEarly(card("x", iso(T)), T), false); // due now
  assert.equal(isEarly(card("x", iso(T - DAY)), T), false); // overdue
  assert.equal(isEarly(card("x", null), T), false); // new card
});

// The review route reschedules iff NOT (practice && isEarly). isEarly is the
// pure gate: an early crammed card is practice-only (schedule untouched), while
// a due/overdue crammed card still schedules normally (vocab-6zd fix).
test("practice gate: only genuinely-early cards skip rescheduling", () => {
  const early = reviewed({ due_at: iso(T + 30 * DAY) });
  const overdue = reviewed({ due_at: iso(T - DAY) });
  assert.equal(isEarly(early, T), true); // → route skips schedule()
  assert.equal(isEarly(overdue, T), false); // → route runs schedule()
});

test("nextDueAt returns the soonest FUTURE due time, ignoring past/new", () => {
  const cards = [
    card("past", iso(T - DAY)),
    card("soon", iso(T + DAY)),
    card("later", iso(T + 3 * DAY)),
    card("new", null),
  ];
  assert.equal(nextDueAt(cards, T), T + DAY);
  assert.equal(nextDueAt([card("past", iso(T - DAY))], T), null);
});

test("exported tuning constants hold their documented values", () => {
  assert.equal(EASE_DEFAULT, 2.5);
  assert.equal(NEW_CARDS_PER_SESSION, 100); // default new-card batch (was 20)
  assert.equal(RELEARN_GAP, 5);
  assert.deepEqual([...SESSION_SIZE_OPTIONS], [20, 50, 100, Infinity]);
});
