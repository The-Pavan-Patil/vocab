// ---------------------------------------------------------------------------
// Study decks — the registry of the four decks and the schedule each one owns.
//
//   vocab        the word card (reading shown)        vocab      base columns
//   word-kanji   the whole word, glyph only           vocab      kanji_* (0004)
//   smart-kanji  one kanji as it appears in a word    kanji_cards base columns
//   all-kanji    the same kanji-in-word cards         kanji_cards all_* (0012)
//
// Every deck keeps an INDEPENDENT schedule (its own columns) and its own tuning,
// so grading a card in one deck never moves another deck's due dates. This
// module is the single adapter between a deck and its columns, so the scheduler
// and session helpers in lib/srs.ts stay deck-agnostic and are reused unchanged.
// Pure + isomorphic: used by the review routes (server) and the decks (client).
// ---------------------------------------------------------------------------

import { newState, type SrsState, type SrsTuning } from "./srs.ts";

export type DeckId = "vocab" | "word-kanji" | "smart-kanji" | "all-kanji";

/** The decks studied from `vocab` rows, and the two studied from `kanji_cards`. */
export type VocabDeckId = "vocab" | "word-kanji";
export type KanjiDeckId = "smart-kanji" | "all-kanji";

/** The vocab review route's `mode` param (and the RPC's p_mode). */
export type StudyMode = "word" | "kanji";
/** The kanji-card review route's `deck` param (and the RPC's p_deck). */
export type KanjiDeckParam = "smart" | "all";

type Columns = Record<keyof SrsState, string>;

const prefixed = (prefix: string): Columns => ({
  ease: `${prefix}ease`,
  interval_days: `${prefix}interval_days`,
  reps: `${prefix}reps`,
  lapses: `${prefix}lapses`,
  state: `${prefix}state`,
  due_at: `${prefix}due_at`,
  last_reviewed_at: `${prefix}last_reviewed_at`,
});

// SRS column names per deck.
const COLS: Record<DeckId, Columns> = {
  vocab: prefixed(""),
  "word-kanji": prefixed("kanji_"),
  "smart-kanji": prefixed(""),
  "all-kanji": prefixed("all_"),
};

/**
 * Each deck's own tuning. Four separate objects on purpose — retuning one deck
 * never changes another. The values started from two presets: the word deck
 * keeps the canonical SM-2 steps; the kanji decks start MORE CONSERVATIVE
 * (recalling a reading from the bare glyph is harder), with a tighter second
 * step and a lower ease ceiling, so kanji come back sooner and grow more slowly.
 */
export const DECK_TUNING: Record<DeckId, SrsTuning> = {
  vocab: {
    easeMin: 1.3,
    easeMax: 2.7,
    easeDelta: { remember: +0.1, right: 0.0, wrong: -0.2 },
    firstInterval: { remember: 2, right: 1 },
    secondInterval: 6,
    maxIntervalDays: 36_500,
  },
  "word-kanji": {
    easeMin: 1.3,
    easeMax: 2.6,
    easeDelta: { remember: +0.1, right: 0.0, wrong: -0.2 },
    firstInterval: { remember: 2, right: 1 },
    secondInterval: 4,
    maxIntervalDays: 18_250,
  },
  "smart-kanji": {
    easeMin: 1.3,
    easeMax: 2.6,
    easeDelta: { remember: +0.1, right: 0.0, wrong: -0.2 },
    firstInterval: { remember: 2, right: 1 },
    secondInterval: 4,
    maxIntervalDays: 18_250,
  },
  "all-kanji": {
    easeMin: 1.3,
    easeMax: 2.6,
    easeDelta: { remember: +0.1, right: 0.0, wrong: -0.2 },
    firstInterval: { remember: 2, right: 1 },
    secondInterval: 4,
    maxIntervalDays: 18_250,
  },
};

/** The deck a vocab review belongs to, from the route's `mode` param. */
export function vocabDeckFromMode(mode: unknown): VocabDeckId {
  return mode === "kanji" ? "word-kanji" : "vocab";
}

/** The deck a kanji-card review belongs to, from the route's `deck` param. */
export function kanjiDeckFromParam(deck: unknown): KanjiDeckId {
  return deck === "all" ? "all-kanji" : "smart-kanji";
}

type Row = Record<string, unknown>;

/**
 * Read a deck's SRS state out of a row, overlaying newState() defaults so a
 * pre-migration / partially-populated row is treated as a brand-new card
 * (`?? default` only fills null/undefined — a real 0 reps/interval is kept).
 */
export function readSrs(row: Row, deck: DeckId): SrsState {
  const c = COLS[deck];
  const d = newState();
  return {
    ease: (row[c.ease] as number | null) ?? d.ease,
    interval_days: (row[c.interval_days] as number | null) ?? d.interval_days,
    reps: (row[c.reps] as number | null) ?? d.reps,
    lapses: (row[c.lapses] as number | null) ?? d.lapses,
    state: (row[c.state] as SrsState["state"] | null) ?? d.state,
    due_at: (row[c.due_at] as string | null) ?? d.due_at,
    last_reviewed_at: (row[c.last_reviewed_at] as string | null) ?? d.last_reviewed_at,
  };
}

/** Produce the DB update object that writes `next` back to a deck's columns. */
export function writeSrs(next: SrsState, deck: DeckId): Record<string, unknown> {
  const c = COLS[deck];
  return {
    [c.ease]: next.ease,
    [c.interval_days]: next.interval_days,
    [c.reps]: next.reps,
    [c.lapses]: next.lapses,
    [c.state]: next.state,
    [c.due_at]: next.due_at,
    [c.last_reviewed_at]: next.last_reviewed_at,
  };
}

/**
 * Project a row so the generic session helpers (buildSession / isNew / isDue /
 * isEarly / nextDueAt) read the RIGHT deck's schedule. For a deck that owns the
 * base columns (vocab, smart-kanji) it's a no-op; otherwise the base SRS fields
 * are overlaid with the deck's own values while render fields (and `id`,
 * `created_at`) are preserved, so new-card ordering is identical.
 */
export function projectCard<T extends Row>(row: T, deck: DeckId): T {
  if (deck === "vocab" || deck === "smart-kanji") return row;
  return { ...row, ...readSrs(row, deck) };
}
