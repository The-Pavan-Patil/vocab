// Tests for the deck registry (lib/decks.ts) — the mapping between a study deck
// and the SRS columns + tuning it owns. Run with:  node --test lib/decks.test.ts
//
// The point of this module is that every deck reuses the generic scheduler /
// session helpers unchanged by projecting its own columns (kanji_* for Word
// Kanji, all_* for All Kanji) onto the base SRS field names. These tests pin
// that projection (and its inverse) down, and that no two decks share a schedule.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DECK_TUNING,
  kanjiDeckFromParam,
  projectCard,
  readSrs,
  vocabDeckFromMode,
  writeSrs,
  type DeckId,
} from "./decks.ts";
import { isNew, isEarly, newState, schedule } from "./srs.ts";
import type { KanjiCard, Vocab } from "./types.ts";

const DAY = 86_400_000;
const T = Date.parse("2026-06-28T00:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

// A fully-populated row whose WORD schedule and KANJI schedule deliberately
// differ, so we can tell which one a function read.
function vocab(over: Partial<Vocab> = {}): Vocab {
  return {
    id: "v1",
    kanji: "食べる",
    romaji: "taberu",
    english: "to eat",
    tips: "खाणे",
    sentence: "毎朝ご飯を食べる。",
    category: "verb",
    created_at: iso(T - 5 * DAY),
    // word track: a mature, future-due card
    ease: 2.6,
    interval_days: 38,
    reps: 4,
    lapses: 0,
    state: "review",
    due_at: iso(T + 30 * DAY),
    last_reviewed_at: iso(T - 8 * DAY),
    // kanji track: a brand-new card (never reviewed)
    study_as_kanji: true,
    kanji_ease: 2.5,
    kanji_interval_days: 0,
    kanji_reps: 0,
    kanji_lapses: 0,
    kanji_state: "new",
    kanji_due_at: null,
    kanji_last_reviewed_at: null,
    kanji_selection: null,
    ...over,
  };
}

test("projectCard('vocab') is the identity — the Vocab deck uses the base columns", () => {
  const v = vocab();
  assert.equal(projectCard(v, "vocab"), v);
});

test("projectCard('word-kanji') overlays kanji_* onto the base SRS fields", () => {
  const v = vocab();
  const k = projectCard(v, "word-kanji");
  // schedule fields now read the KANJI track...
  assert.equal(k.ease, v.kanji_ease);
  assert.equal(k.interval_days, v.kanji_interval_days);
  assert.equal(k.reps, v.kanji_reps);
  assert.equal(k.state, v.kanji_state);
  assert.equal(k.due_at, v.kanji_due_at);
  assert.equal(k.last_reviewed_at, v.kanji_last_reviewed_at);
  // ...while the render fields are preserved.
  assert.equal(k.kanji, "食べる");
  assert.equal(k.romaji, "taberu");
  assert.equal(k.english, "to eat");
  assert.equal(k.id, "v1");
});

test("the projection makes the generic session predicates read the kanji schedule", () => {
  const v = vocab(); // word card is future-due; kanji card is brand-new
  // Word view: a reviewed card whose due date is ahead → "early", not new.
  assert.equal(isNew(projectCard(v, "vocab")), false);
  assert.equal(isEarly(projectCard(v, "vocab"), T), true);
  // Kanji view: never reviewed → new (and therefore not "early").
  assert.equal(isNew(projectCard(v, "word-kanji")), true);
  assert.equal(isEarly(projectCard(v, "word-kanji"), T), false);
});

test("readSrs reads the right column set for each deck", () => {
  const v = vocab();
  assert.deepEqual(readSrs(v, "vocab"), {
    ease: 2.6,
    interval_days: 38,
    reps: 4,
    lapses: 0,
    state: "review",
    due_at: iso(T + 30 * DAY),
    last_reviewed_at: iso(T - 8 * DAY),
  });
  assert.deepEqual(readSrs(v, "word-kanji"), {
    ease: 2.5,
    interval_days: 0,
    reps: 0,
    lapses: 0,
    state: "new",
    due_at: null,
    last_reviewed_at: null,
  });
});

test("readSrs overlays newState() defaults for a pre-migration / sparse row", () => {
  // A row with none of the kanji_* columns present (e.g. before 0004 ran).
  assert.deepEqual(readSrs({}, "word-kanji"), newState());
});

test("writeSrs targets the right columns for each deck", () => {
  const next = newState();
  next.interval_days = 7;
  next.due_at = iso(T + 7 * DAY);

  assert.deepEqual(writeSrs(next, "vocab"), {
    ease: next.ease,
    interval_days: 7,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    due_at: iso(T + 7 * DAY),
    last_reviewed_at: next.last_reviewed_at,
  });
  assert.deepEqual(writeSrs(next, "word-kanji"), {
    kanji_ease: next.ease,
    kanji_interval_days: 7,
    kanji_reps: next.reps,
    kanji_lapses: next.lapses,
    kanji_state: next.state,
    kanji_due_at: iso(T + 7 * DAY),
    kanji_last_reviewed_at: next.last_reviewed_at,
  });
});

// A kanji card whose Smart Kanji schedule (base columns) is mature and whose
// All Kanji schedule (all_*) is brand-new, so we can tell which one was read.
function kanjiCard(over: Partial<KanjiCard> = {}): KanjiCard {
  return {
    id: "k1",
    character: "食",
    jlpt: 5,
    word: "食べる",
    reading: "た",
    word_reading: "た.べる",
    word_prompt_parts: null,
    word_meaning: "to eat",
    word_sentence: null,
    vocab_id: "v1",
    active: true,
    created_at: iso(T - 5 * DAY),
    ease: 2.4,
    interval_days: 12,
    reps: 3,
    lapses: 1,
    state: "review",
    due_at: iso(T + 12 * DAY),
    last_reviewed_at: iso(T - 1 * DAY),
    all_ease: 2.5,
    all_interval_days: 0,
    all_reps: 0,
    all_lapses: 0,
    all_state: "new",
    all_due_at: null,
    all_last_reviewed_at: null,
    ...over,
  };
}

test("projectCard('smart-kanji') is the identity; 'all-kanji' reads all_*", () => {
  const c = kanjiCard();
  assert.equal(projectCard(c, "smart-kanji"), c);
  const all = projectCard(c, "all-kanji");
  assert.equal(all.due_at, null);
  assert.equal(all.reps, 0);
  assert.equal(all.state, "new");
  assert.equal(all.character, "食");
  assert.equal(all.word, "食べる");
  assert.equal(isEarly(projectCard(c, "smart-kanji"), T), true);
  assert.equal(isNew(all), true);
});

test("writeSrs('all-kanji') targets the all_* columns only", () => {
  const next = newState();
  next.interval_days = 2;
  assert.deepEqual(Object.keys(writeSrs(next, "all-kanji")).sort(), [
    "all_due_at",
    "all_ease",
    "all_interval_days",
    "all_lapses",
    "all_last_reviewed_at",
    "all_reps",
    "all_state",
  ]);
});

test("the two decks on each table never share a schedule column", () => {
  const pairs: [DeckId, DeckId][] = [
    ["vocab", "word-kanji"], // vocab rows
    ["smart-kanji", "all-kanji"], // kanji_cards rows
  ];
  for (const [a, b] of pairs) {
    const colsA = Object.keys(writeSrs(newState(), a));
    const colsB = Object.keys(writeSrs(newState(), b));
    assert.equal(colsA.filter((col) => colsB.includes(col)).length, 0);
  }
});

test("every deck has its own tuning object (retuning one moves no other)", () => {
  const tunings = Object.values(DECK_TUNING);
  assert.equal(new Set(tunings).size, tunings.length);
  // Nested objects too — a shared easeDelta would still couple two decks.
  const deltas = tunings.map((t) => t.easeDelta);
  assert.equal(new Set(deltas).size, deltas.length);
  const firsts = tunings.map((t) => t.firstInterval);
  assert.equal(new Set(firsts).size, firsts.length);
});

test("the decks start from today's intervals: Vocab 6-day, kanji decks 4-day second step", () => {
  const twoPasses = (deck: DeckId) => {
    const first = schedule(newState(), "right", T, DECK_TUNING[deck]).next;
    return schedule(first, "right", T, DECK_TUNING[deck]).next.interval_days;
  };
  assert.equal(twoPasses("vocab"), 6);
  assert.equal(twoPasses("word-kanji"), 4);
  assert.equal(twoPasses("smart-kanji"), 4);
  assert.equal(twoPasses("all-kanji"), 4);
});

test("route params map onto decks, defaulting to the original deck", () => {
  assert.equal(vocabDeckFromMode("kanji"), "word-kanji");
  assert.equal(vocabDeckFromMode("word"), "vocab");
  assert.equal(vocabDeckFromMode(undefined), "vocab");
  assert.equal(kanjiDeckFromParam("all"), "all-kanji");
  assert.equal(kanjiDeckFromParam("smart"), "smart-kanji");
  assert.equal(kanjiDeckFromParam(42), "smart-kanji");
});
