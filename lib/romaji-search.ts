// ---------------------------------------------------------------------------
// Romaji in front of the Jisho search. Jisho converts romaji to kana only when
// the query is all lowercase ("Taberu" — a phone's auto-capital — finds
// nothing), and reads a doubled vowel as two kana ("koohii" → こおひい), so the
// romaji we show for a katakana word (toRomaji("コーヒー") = "koohii") can't be
// searched back. These helpers pick the extra Jisho queries that fix that and
// merge their results. Pure (wanakana only) so the tests can pin them down.
// ---------------------------------------------------------------------------

import { isKana, toHiragana, toKatakana } from "wanakana";
import type { DictEntry } from "./types.ts";

/** Jisho's page size — the merged list never grows past one page. */
export const RESULT_LIMIT = 20;

// Hepburn long vowels. ō → "ou" is the common case (kyō, gakkō); words spelt
// with おお (ōkii) still need "ookii".
const LONG_VOWELS: Record<string, string> = {
  ā: "aa", â: "aa",
  ī: "ii", î: "ii",
  ū: "uu", û: "uu",
  ē: "ee", ê: "ee",
  ō: "ou", ô: "ou",
};

/** Lowercase, straight apostrophes, macrons spelt out: "Kyō" → "kyou". */
export function normalizeRomaji(q: string): string {
  return q
    .normalize("NFC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[āâīîūûēêōô]/g, (c) => LONG_VOWELS[c]);
}

/**
 * The Jisho queries to run for `q`, in priority order, or null when `q` isn't
 * romaji (Japanese, English like "eat", or several words) and should be sent
 * as typed. Extra queries cost a Jisho call each, so only useful ones are added:
 *  1. the query as typed — a capital can matter for English ("Tokyo" → 東京);
 *  2. the normalised romaji, when it differs ("Taberu" → "taberu");
 *  3. katakana with long vowels, when a vowel is doubled ("koohii" → コーヒー).
 */
export function romajiSearch(
  q: string
): { romaji: string; keys: string[] } | null {
  const romaji = normalizeRomaji(q);
  if (!/^[a-z'-]+$/.test(romaji) || !/[a-z]/.test(romaji)) return null;
  if (!isKana(toHiragana(romaji))) return null;
  const keys = [q];
  if (romaji !== q) keys.push(romaji);
  if (/([aiueo])\1/.test(romaji)) {
    keys.push(toKatakana(romaji.replace(/([aiueo])\1/g, "$1-")));
  }
  return { romaji, keys };
}

/**
 * The list with `entry` moved (or added) to the top — the dictionary form of a
 * conjugated search — still capped at one page.
 */
export function leadWith(
  results: DictEntry[],
  entry: DictEntry,
  limit = RESULT_LIMIT
): DictEntry[] {
  return [entry, ...results.filter((e) => e.slug !== entry.slug)].slice(0, limit);
}

/**
 * One result list from the per-query lists (in key order): duplicates dropped
 * by slug, entries whose shown romaji is exactly what was typed moved to the
 * top, Jisho's order kept otherwise, capped at one page.
 */
export function mergeResults(
  lists: DictEntry[][],
  romaji?: string,
  limit = RESULT_LIMIT
): DictEntry[] {
  const seen = new Set<string>();
  const all = lists.flat().filter((e) => {
    if (seen.has(e.slug)) return false;
    seen.add(e.slug);
    return true;
  });
  const exact = all.filter((e) => romaji !== undefined && e.romaji === romaji);
  const rest = all.filter((e) => !exact.includes(e));
  return [...exact, ...rest].slice(0, limit);
}
