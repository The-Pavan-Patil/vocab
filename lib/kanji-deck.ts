// ---------------------------------------------------------------------------
// Smart Kanji / All Kanji deck helpers — JLPT level filtering, kanji extraction,
// and the All Kanji queue. Pure + isomorphic (only the pure scheduler helpers
// are imported), so both the UI and the tests can use them and the "does it
// show every kanji?" property is verifiable in isolation.
// ---------------------------------------------------------------------------

import { NEW_CARDS_PER_SESSION, isDue, isNew } from "./srs.ts";

/** JLPT levels, easiest (N5 = 5) to hardest (N1 = 1). */
export const JLPT_LEVELS: readonly number[] = [5, 4, 3, 2, 1];

/** Sentinel for "every level". */
export const ALL_LEVELS = 0;

/** Selector label. Cumulative — N4 means "N5–N4"; the sentinel is "All". */
export function levelLabel(level: number): string {
  if (level === ALL_LEVELS) return "All";
  return level === 5 ? "N5" : `N5–N${level}`;
}

/**
 * Whether a card belongs to the active (cumulative) level — the chosen level or
 * any EASIER one. N5 is jlpt 5 (easiest) … N1 is jlpt 1, so "easier" means a
 * HIGHER jlpt int. Selecting N4 (4) ⇒ matches jlpt 5 and 4; ALL matches everything.
 */
export function matchesLevel(card: { jlpt: number | null }, level: number): boolean {
  return level === ALL_LEVELS || (card.jlpt != null && card.jlpt >= level);
}

const KANJI_RE = /[一-龯㐀-䶿]/g;

/** Unique kanji (CJK ideographs) in a string, in first-seen order. */
export function kanjiChars(text: string): string[] {
  return [...new Set(text.match(KANJI_RE) ?? [])];
}

/**
 * Every unique kanji across the cards' source words, in first-seen order — the
 * characters whose details a card's back can show (not only the studied one).
 */
export function wordKanjiChars(cards: { word: string }[]): string[] {
  return [...new Set(cards.flatMap((card) => kanjiChars(card.word)))];
}

/**
 * Cluster cards so every card sharing a `character` is consecutive, preserving
 * each character's first-appearance order in the input (stable within a group
 * too). Feeding a newest-first list therefore yields groups ordered by their
 * newest member, newest-first inside each group — the "All Kanji" order.
 */
export function groupByKanji<T extends { character: string }>(cards: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of cards) {
    const g = groups.get(c.character);
    if (g) g.push(c);
    else groups.set(c.character, [c]);
  }
  return [...groups.values()].flat();
}

/**
 * Refresh the data attached to a live queue without rebuilding its membership or
 * order. Repeated entries (a forgotten card queued for relearning) stay repeated;
 * cards no longer present in the active deck are removed.
 */
export function refreshQueuedKanjiCards<T extends { id: string }>(
  queue: T[],
  activeCards: T[]
): T[] {
  const latest = new Map(activeCards.map((card) => [card.id, card]));
  return queue
    .map((card) => latest.get(card.id))
    .filter((card): card is T => card !== undefined);
}

type QueueCard = {
  character: string;
  created_at: string;
  due_at?: string | null;
};

const createdTime = (card: { created_at: string }) =>
  Date.parse(card.created_at) || 0;

/** Newest word first — All Kanji's order, for the queue and for "Add more". */
export function newestFirst<T extends { created_at: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => createdTime(b) - createdTime(a));
}

/**
 * The All Kanji queue. `cards` must already be projected onto All Kanji's own
 * schedule (projectCard(card, "all-kanji")). Membership follows the same rules
 * as buildSession — every due review (never capped), then up to `newLimit`
 * never-studied cards, future-due cards left out unless `cram` — but new cards
 * are picked NEWEST word first, and the whole queue is ordered newest word
 * first with each kanji's words grouped together.
 */
export function buildAllKanjiQueue<T extends QueueCard>(
  cards: T[],
  now: number,
  opts: { newLimit?: number; cram?: boolean } = {}
): T[] {
  const { newLimit = NEW_CARDS_PER_SESSION, cram = false } = opts;
  const due: T[] = [];
  const fresh: T[] = [];
  for (const card of cards) {
    if (isNew(card)) fresh.push(card);
    else if (cram || isDue(card, now)) due.push(card);
  }
  return groupByKanji(
    newestFirst([...due, ...newestFirst(fresh).slice(0, newLimit)])
  );
}
