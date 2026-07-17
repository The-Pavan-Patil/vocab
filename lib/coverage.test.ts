// Deck COVERAGE tests — "does the algorithm show every vocab word and every
// kanji from my list, or does it silently drop some?"  Run:
//   node --test lib/coverage.test.ts
//
// The session builder caps how many NEW cards it introduces at once, so the
// worry is whether the rest are lost. They aren't — the cap DEFERS, it never
// deletes. These tests pin that guarantee for both the vocab/kanji word decks
// (buildSession) and the smart kanji deck (matchesLevel / kanjiChars). The exact
// pass criteria are written out in docs/deck-coverage.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSession } from "./srs.ts";
import {
  ALL_LEVELS,
  JLPT_LEVELS,
  groupByKanji,
  kanjiChars,
  matchesLevel,
  refreshQueuedKanjiCards,
} from "./kanji-deck.ts";

const DAY = 86_400_000;
const T = Date.parse("2026-06-28T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
type Card = { id: string; due_at: string | null; created_at?: string };
const due = (id: string, daysOverdue: number): Card => ({ id, due_at: iso(T - daysOverdue * DAY) });
const fresh = (id: string, createdOffset = 0): Card => ({
  id,
  due_at: null,
  created_at: iso(T + createdOffset),
});

// ===========================================================================
// Vocab / kanji word decks — buildSession coverage
// ===========================================================================

// AC1 — every DUE review is shown; due cards are never capped.
test("AC1: all due reviews are shown even when the new-card cap is tiny", () => {
  const dues = Array.from({ length: 50 }, (_, i) => due(`d${i}`, i + 1));
  const news = Array.from({ length: 5 }, (_, i) => fresh(`n${i}`, i));
  const q = buildSession([...dues, ...news], T, { newLimit: 3 });
  assert.equal(q.filter((c) => c.due_at != null).length, 50); // all 50 due appear
  assert.equal(q.filter((c) => c.due_at == null).length, 3); // new still capped at 3
});

// AC2 — with size = "All", every studyable card is present (nothing missing).
test("AC2: newLimit Infinity shows every due + new card, excludes only future", () => {
  const dues = Array.from({ length: 10 }, (_, i) => due(`d${i}`, i + 1));
  const news = Array.from({ length: 40 }, (_, i) => fresh(`n${i}`, i));
  const future = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, due_at: iso(T + (i + 1) * DAY) }));
  const q = buildSession([...dues, ...news, ...future], T, { newLimit: Infinity });
  const shown = new Set(q.map((c) => c.id));
  assert.equal(q.length, 50); // 10 due + 40 new, no future
  for (const c of [...dues, ...news]) assert.ok(shown.has(c.id), `${c.id} must appear`);
  for (const c of future) assert.ok(!shown.has(c.id), `${c.id} is future → deferred`);
});

// AC3 — the new-card cap DEFERS, never drops: draining over successive sessions
// surfaces every new card exactly once, in oldest-added order.
test("AC3: every new card surfaces across sessions (cap defers, never deletes)", () => {
  const M = 25;
  const k = 10;
  // c0 oldest … c24 newest; fed in REVERSED order to prove ordering is by
  // created_at, not input order.
  const all = Array.from({ length: M }, (_, i) => fresh(`c${i}`, i * 1000));
  const pool = [...all].reverse().map((c) => ({ ...c }));

  const shown: string[] = [];
  let guard = 0;
  while (pool.some((c) => c.due_at == null) && guard++ < 100) {
    const session = buildSession(pool, T, { newLimit: k });
    const introduced = session.filter((c) => c.due_at == null);
    if (introduced.length === 0) break;
    for (const c of introduced) {
      shown.push(c.id);
      // "study" it → schedule into the future so it leaves the new pool.
      pool.find((p) => p.id === c.id)!.due_at = iso(T + 100 * DAY);
    }
  }

  assert.equal(shown.length, M); // each shown once …
  assert.equal(new Set(shown).size, M); // … no duplicates …
  assert.deepEqual(
    [...shown].sort(),
    all.map((c) => c.id).sort()
  ); // … and ALL covered.
  assert.deepEqual(shown, all.map((c) => c.id)); // introduced oldest-first
});

// AC4 — no card appears twice within a single session.
test("AC4: a single session has no duplicates", () => {
  const cards = [
    ...Array.from({ length: 15 }, (_, i) => due(`d${i}`, i + 1)),
    ...Array.from({ length: 30 }, (_, i) => fresh(`n${i}`, i)),
  ];
  const q = buildSession(cards, T, { newLimit: 20 });
  assert.equal(new Set(q.map((c) => c.id)).size, q.length);
});

// AC5 — future cards are deferred (not in a normal session) but recoverable.
test("AC5: future-due cards are deferred, not lost (cram recovers them)", () => {
  const f = { id: "f", due_at: iso(T + 10 * DAY) };
  assert.ok(!buildSession([f], T).some((c) => c.id === "f"));
  assert.ok(buildSession([f], T, { cram: true }).some((c) => c.id === "f"));
});

// ===========================================================================
// Smart kanji deck — level filtering & kanji extraction coverage
// ===========================================================================

const leveled = [
  { id: "a", jlpt: 5 },
  { id: "b", jlpt: 4 },
  { id: "c", jlpt: 3 },
  { id: "d", jlpt: 2 },
  { id: "e", jlpt: 1 },
];

// AC6 — "All" surfaces every kanji card.
test("AC6: ALL_LEVELS shows every kanji card", () => {
  assert.equal(leveled.filter((c) => matchesLevel(c, ALL_LEVELS)).length, leveled.length);
});

// AC7 — cumulative: selecting a level includes it and every EASIER level.
test("AC7: selecting N4 includes N5 + N4; harder levels are excluded", () => {
  assert.equal(matchesLevel({ jlpt: 5 }, 4), true); // N5 included under N4
  assert.equal(matchesLevel({ jlpt: 4 }, 4), true);
  assert.equal(matchesLevel({ jlpt: 3 }, 4), false); // N3 is harder than N4
  assert.equal(matchesLevel({ jlpt: 5 }, 5), true); // N5 only → just N5
  assert.equal(matchesLevel({ jlpt: 4 }, 5), false);
});

// AC8 — every leveled card is reachable: N1 (or All) covers all; each card is in
// at least its own level's selection → nothing is stranded.
test("AC8: every leveled kanji is reachable by some selection", () => {
  assert.equal(leveled.filter((c) => matchesLevel(c, 1)).length, leveled.length); // N1 cumulative = all
  assert.equal(leveled.filter((c) => matchesLevel(c, ALL_LEVELS)).length, leveled.length);
  for (const c of leveled) assert.ok(matchesLevel(c, c.jlpt!), `${c.id} reachable at its own level`);
  // The selector offers every real level plus All.
  assert.deepEqual([...JLPT_LEVELS], [5, 4, 3, 2, 1]);
});

// AC9 — every kanji in a word is extracted (deduped, first-seen order); kana/latin
// contribute nothing.
test("AC9: kanjiChars extracts every kanji of a word", () => {
  assert.deepEqual(kanjiChars("日本語"), ["日", "本", "語"]);
  assert.deepEqual(kanjiChars("食べる"), ["食"]);
  assert.deepEqual(kanjiChars("林林森"), ["林", "森"]); // de-duplicated, order kept
  assert.deepEqual(kanjiChars("ひらがなABC"), []); // no kanji → nothing dropped, nothing invented
});

// ===========================================================================
// "All Kanjis" review — grouping coverage (groupByKanji)
// ===========================================================================

const kc = (character: string, word: string) => ({ character, word });

// AC10 — same kanji's cards end up consecutive, and every input card survives
// exactly once (grouping reorders, it never drops or duplicates).
test("AC10: groupByKanji clusters each kanji's cards, keeping all of them", () => {
  const input = [
    kc("来", "来週"),
    kc("日", "日本"),
    kc("来", "来年"),
    kc("本", "本"),
    kc("日", "毎日"),
    kc("来", "未来"),
  ];
  const out = groupByKanji(input);
  // Same count, same set — nothing lost or invented.
  assert.equal(out.length, input.length);
  assert.deepEqual(
    out.map((c) => c.word).sort(),
    input.map((c) => c.word).sort()
  );
  // Each character occupies one contiguous run.
  const runs = out.map((c) => c.character).filter((ch, i, a) => ch !== a[i - 1]);
  assert.equal(new Set(runs).size, runs.length, "no character appears in two runs");
});

// AC11 — groups appear in first-appearance order; within a group, input order is
// preserved. Feeding a newest-first list therefore yields newest-first groups.
test("AC11: groupByKanji preserves first-appearance + within-group order", () => {
  const input = [
    kc("来", "来週"), // 来 seen first
    kc("日", "日本"), // 日 seen second
    kc("来", "来年"),
    kc("日", "毎日"),
  ];
  assert.deepEqual(groupByKanji(input), [
    kc("来", "来週"),
    kc("来", "来年"),
    kc("日", "日本"),
    kc("日", "毎日"),
  ]);
});

// AC12 — degenerate inputs are safe.
test("AC12: groupByKanji handles empty and all-distinct inputs", () => {
  assert.deepEqual(groupByKanji([]), []);
  const distinct = [kc("日", "日"), kc("本", "本"), kc("語", "語")];
  assert.deepEqual(groupByKanji(distinct), distinct); // nothing to cluster → unchanged
});

// AC13 — refreshing server-backed card data must not restart a live session.
test("AC13: queue refresh preserves order, progress, and relearning duplicates", () => {
  const queue = [
    { id: "b", value: "old-b" },
    { id: "a", value: "old-a" },
    { id: "b", value: "old-b" }, // requeued after a lapse
  ];
  const refreshed = refreshQueuedKanjiCards(queue, [
    { id: "a", value: "new-a" },
    { id: "b", value: "new-b" },
    { id: "c", value: "new-c" }, // new deck member: not injected mid-session
  ]);
  assert.deepEqual(refreshed, [
    { id: "b", value: "new-b" },
    { id: "a", value: "new-a" },
    { id: "b", value: "new-b" },
  ]);
});

test("AC14: queue refresh removes cards that are no longer active", () => {
  assert.deepEqual(
    refreshQueuedKanjiCards(
      [
        { id: "active" },
        { id: "inactive" },
      ],
      [{ id: "active" }]
    ),
    [{ id: "active" }]
  );
});
