// Tests for the deck adapter (lib/decks.ts) — the mapping between a study deck
// and the SRS columns it uses. Run with:  node --test lib/decks.test.ts
//
// The point of this module is that the kanji deck reuses the generic scheduler /
// session helpers unchanged by projecting a row's kanji_* columns onto the base
// SRS field names. These tests pin that projection (and its inverse) down.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deckCard, readSrs, writeSrs } from "./decks.ts";
import { isNew, isEarly, newState } from "./srs.ts";
import type { Vocab } from "./types.ts";

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
    ...over,
  };
}

test("deckCard('word') is the identity — the word deck uses the base columns", () => {
  const v = vocab();
  assert.equal(deckCard(v, "word"), v);
});

test("deckCard('kanji') overlays kanji_* onto the base SRS fields", () => {
  const v = vocab();
  const k = deckCard(v, "kanji");
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
  assert.equal(isNew(deckCard(v, "word")), false);
  assert.equal(isEarly(deckCard(v, "word"), T), true);
  // Kanji view: never reviewed → new (and therefore not "early").
  assert.equal(isNew(deckCard(v, "kanji")), true);
  assert.equal(isEarly(deckCard(v, "kanji"), T), false);
});

test("readSrs reads the right column set for each deck", () => {
  const v = vocab();
  assert.deepEqual(readSrs(v, "word"), {
    ease: 2.6,
    interval_days: 38,
    reps: 4,
    lapses: 0,
    state: "review",
    due_at: iso(T + 30 * DAY),
    last_reviewed_at: iso(T - 8 * DAY),
  });
  assert.deepEqual(readSrs(v, "kanji"), {
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
  assert.deepEqual(readSrs({}, "kanji"), newState());
});

test("writeSrs targets the right columns for each deck", () => {
  const next = newState();
  next.interval_days = 7;
  next.due_at = iso(T + 7 * DAY);

  assert.deepEqual(writeSrs(next, "word"), {
    ease: next.ease,
    interval_days: 7,
    reps: next.reps,
    lapses: next.lapses,
    state: next.state,
    due_at: iso(T + 7 * DAY),
    last_reviewed_at: next.last_reviewed_at,
  });
  assert.deepEqual(writeSrs(next, "kanji"), {
    kanji_ease: next.ease,
    kanji_interval_days: 7,
    kanji_reps: next.reps,
    kanji_lapses: next.lapses,
    kanji_state: next.state,
    kanji_due_at: iso(T + 7 * DAY),
    kanji_last_reviewed_at: next.last_reviewed_at,
  });
});
