export type Vocab = {
  id: string;
  kanji: string;
  romaji: string | null;
  english: string | null;
  tips: string | null; // Marathi meaning / mnemonic
  category: string | null;
  created_at: string;
  // Spaced-repetition state (see lib/srs.ts + docs/spaced-repetition.md).
  // Populated by `select("*")` once migration 0003 has run; on a pre-migration
  // database these arrive undefined and the scheduler treats the card as new.
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  state: "new" | "review" | "relearning";
  due_at: string | null;
  last_reviewed_at: string | null;
};

// Re-export the SRS grade so UI code can import it from one place.
export type { Grade } from "./srs";

// A row that has not yet been persisted (no id / created_at).
export type VocabInput = {
  kanji: string;
  romaji?: string | null;
  english?: string | null;
  tips?: string | null;
  category?: string | null;
};

export const CATEGORIES = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "particle",
  "phrase",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];

// The canonical column order used for export (.docx / .pdf) and import preview.
export const COLUMNS: { key: keyof VocabInput; label: string }[] = [
  { key: "kanji", label: "Kanji" },
  { key: "romaji", label: "Romaji" },
  { key: "english", label: "English Meaning" },
  { key: "tips", label: "Tips (Marathi)" },
  { key: "category", label: "Category" },
];

// ---------------------------------------------------------------------------
// Dictionary (Takoboto-style) — sourced from JMdict/KanjiDic/Tatoeba via Jisho.
// ---------------------------------------------------------------------------

export type DictSense = {
  englishDefinitions: string[];
  partsOfSpeech: string[];
  tags: string[];
};

export type DictEntry = {
  slug: string;
  word: string; // primary written form (kanji/kana)
  reading: string; // kana reading
  romaji: string; // reading converted to romaji
  isCommon: boolean;
  jlpt: string[]; // e.g. ["jlpt-n5"]
  senses: DictSense[];
};

export type DictExample = {
  japanese: string; // sentence with kanji
  kana: string; // reading
  romaji: string; // full romaji (for learners who can't read all the kanji)
  english: string;
};

export type DictKanji = {
  char: string;
  meaning: string;
  kunyomi: string[];
  onyomi: string[];
  strokeCount: string;
  jlpt: string;
};

export type DictDetails = {
  examples: DictExample[];
  kanji: DictKanji[];
};

// Map Jisho parts-of-speech strings onto our vocab categories.
export function partOfSpeechToCategory(partsOfSpeech: string[]): Category {
  const pos = partsOfSpeech.join(" ").toLowerCase();
  if (pos.includes("verb")) return "verb";
  if (pos.includes("adjective") || pos.includes("adjectival")) return "adjective";
  if (pos.includes("adverb")) return "adverb";
  if (pos.includes("particle")) return "particle";
  if (pos.includes("expression") || pos.includes("phrase")) return "phrase";
  if (pos.includes("noun")) return "noun";
  return "other";
}
