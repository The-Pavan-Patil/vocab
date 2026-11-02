// ---------------------------------------------------------------------------
// The List tab's search and filters. Pure (no React) so the tests can pin the
// "where did I turn this kanji on?" behavior down.
// ---------------------------------------------------------------------------

import { kanjiChars } from "./kanji-deck.ts";
import { selectionForWord } from "./kanji-selection.ts";
import type { Vocab } from "./types.ts";

/** Which of a word's fields the search looks in. */
export const SEARCH_FIELDS = [
  { value: "all", label: "All fields" },
  { value: "kanji", label: "Word" },
  { value: "romaji", label: "Romaji" },
  { value: "english", label: "Meaning" },
  { value: "tips", label: "Marathi" },
  { value: "sentence", label: "Sentence" },
] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number]["value"];

/** Kanji-study filter. With kanji in the search, it checks those kanji. */
export const KANJI_STUDY_FILTERS = [
  { value: "all", label: "Any kanji study" },
  { value: "on", label: "Studied as Kanji" },
  { value: "off", label: "Not studied as Kanji" },
] as const;

export type KanjiStudyFilter = (typeof KANJI_STUDY_FILTERS)[number]["value"];

export const isSearchField = (value: string): value is SearchField =>
  SEARCH_FIELDS.some((field) => field.value === value);

export const isKanjiStudyFilter = (value: string): value is KanjiStudyFilter =>
  KANJI_STUDY_FILTERS.some((filter) => filter.value === value);

/**
 * The kanji of a word you study as cards, in the word's order. A word saved
 * before per-kanji selection (NULL) studies its JLPT-graded kanji, which the
 * list can't tell from the ungraded ones without the kanji details — it counts
 * them all, which is right for nearly every word.
 */
export function studiedKanjiOf(
  word: Pick<Vocab, "kanji" | "study_as_kanji" | "kanji_selection">
): string[] {
  if (!word.study_as_kanji) return [];
  return (
    selectionForWord(word.kanji, word.kanji_selection) ?? kanjiChars(word.kanji)
  );
}

const FIELD_KEYS: Record<
  Exclude<SearchField, "all">,
  (keyof Vocab)[]
> = {
  kanji: ["kanji"],
  romaji: ["romaji"],
  english: ["english"],
  tips: ["tips"],
  sentence: ["sentence"],
};

const ALL_FIELDS: (keyof Vocab)[] = [
  "kanji",
  "romaji",
  "english",
  "tips",
  "sentence",
  "category",
];

/**
 * The words matching the search and every filter. "Studied as Kanji" means the
 * word has kanji cards — or, when the search holds kanji, that every searched
 * kanji is turned on in it. So 上 + "Studied as Kanji" lists exactly the words
 * where you turned 上 on; "Not studied" is its complement.
 */
export function filterVocab(
  vocab: Vocab[],
  filters: {
    query: string;
    field: SearchField;
    category: string;
    kanjiStudy: KanjiStudyFilter;
  }
): Vocab[] {
  const q = filters.query.trim().toLowerCase();
  const keys = filters.field === "all" ? ALL_FIELDS : FIELD_KEYS[filters.field];
  const queryKanji = kanjiChars(filters.query);
  return vocab.filter((word) => {
    if (filters.category !== "all" && word.category !== filters.category) {
      return false;
    }
    if (filters.kanjiStudy !== "all") {
      const studied = studiedKanjiOf(word);
      const on =
        studied.length > 0 &&
        queryKanji.every((character) => studied.includes(character));
      if (on !== (filters.kanjiStudy === "on")) return false;
    }
    if (!q) return true;
    return keys.some((key) => {
      const value = word[key];
      return typeof value === "string" && value.toLowerCase().includes(q);
    });
  });
}
