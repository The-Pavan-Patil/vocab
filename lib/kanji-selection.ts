import { kanjiChars } from "./kanji-deck.ts";

export type KanjiSelectionResult =
  | { ok: true; selection: string[] | null }
  | { ok: false; error: string };

/**
 * Validate an API-provided curated selection. Null/undefined means the legacy
 * default (all JLPT-graded kanji); an array, including [], is an explicit set.
 */
export function validateKanjiSelection(
  word: string,
  value: unknown
): KanjiSelectionResult {
  if (value == null) return { ok: true, selection: null };
  if (!Array.isArray(value)) {
    return { ok: false, error: "kanji_selection must be an array or null." };
  }

  const allowed = new Set(kanjiChars(word));
  const seen = new Set<string>();
  for (const valueAtIndex of value) {
    if (
      typeof valueAtIndex !== "string" ||
      kanjiChars(valueAtIndex).length !== 1 ||
      kanjiChars(valueAtIndex)[0] !== valueAtIndex ||
      !allowed.has(valueAtIndex)
    ) {
      return {
        ok: false,
        error: `kanji_selection may contain only single kanji found in “${word}”.`,
      };
    }
    if (seen.has(valueAtIndex)) {
      return {
        ok: false,
        error: `kanji_selection contains the duplicate kanji “${valueAtIndex}”.`,
      };
    }
    seen.add(valueAtIndex);
  }

  return { ok: true, selection: [...seen] };
}

/**
 * Defensive normalization for rows saved before strict API validation existed.
 * It never introduces characters and keeps the word's first-seen kanji order.
 */
export function selectionForWord(
  word: string,
  saved: unknown
): string[] | null {
  if (!Array.isArray(saved)) return null;
  const chosen = new Set(saved.filter((value): value is string => typeof value === "string"));
  return kanjiChars(word).filter((character) => chosen.has(character));
}
