// ---------------------------------------------------------------------------
// Study decks — the "word" deck and the "kanji" deck.
//
// A vocab row carries TWO independent SRS schedules: the base columns (the word
// card, which shows the reading) and the parallel `kanji_*` columns added in
// migration 0004 (the kanji-only card). This module is the single adapter that
// maps between a deck and the columns it uses, so the scheduler and session
// helpers in lib/srs.ts stay deck-agnostic and are reused unchanged for both.
// Pure + isomorphic: used by the review route (server) and Flashcards (client).
// ---------------------------------------------------------------------------

import type { Vocab } from "./types.ts";
import { newState, type SrsState } from "./srs.ts";

/** Which deck a card is being studied in. */
export type StudyMode = "word" | "kanji";

// SRS column names per deck. The word deck uses the original 0003 columns; the
// kanji deck uses the parallel kanji_* columns from 0004.
const COLS: Record<StudyMode, Record<keyof SrsState, string>> = {
  word: {
    ease: "ease",
    interval_days: "interval_days",
    reps: "reps",
    lapses: "lapses",
    state: "state",
    due_at: "due_at",
    last_reviewed_at: "last_reviewed_at",
  },
  kanji: {
    ease: "kanji_ease",
    interval_days: "kanji_interval_days",
    reps: "kanji_reps",
    lapses: "kanji_lapses",
    state: "kanji_state",
    due_at: "kanji_due_at",
    last_reviewed_at: "kanji_last_reviewed_at",
  },
};

type Row = Record<string, unknown>;

/**
 * Read a deck's SRS state out of a vocab row, overlaying newState() defaults so
 * a pre-migration / partially-populated row is treated as a brand-new card
 * (`?? default` only fills null/undefined — a real 0 reps/interval is kept).
 */
export function readSrs(row: Row, mode: StudyMode): SrsState {
  const c = COLS[mode];
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
export function writeSrs(next: SrsState, mode: StudyMode): Record<string, unknown> {
  const c = COLS[mode];
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
 * Project a vocab row so the generic session helpers (buildSession / isNew /
 * isDue / isEarly / nextDueAt) read the RIGHT deck's schedule. For "word" it's
 * a no-op; for "kanji" the base SRS fields are overlaid with the kanji_* values
 * while render fields (kanji / romaji / english / id) are preserved. `created_at`
 * is shared by both decks, so new-card ordering is identical.
 */
export function deckCard(v: Vocab, mode: StudyMode): Vocab {
  if (mode === "word") return v;
  return { ...v, ...readSrs(v, "kanji") };
}
