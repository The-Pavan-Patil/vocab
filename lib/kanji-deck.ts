// ---------------------------------------------------------------------------
// Smart Kanji deck helpers — JLPT level filtering + kanji extraction.
// Pure + isomorphic (no imports), so both the UI and the tests can use them and
// the "does it show every kanji?" property is verifiable in isolation.
// ---------------------------------------------------------------------------

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
