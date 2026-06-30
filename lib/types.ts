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
  // Kanji study deck (migration 0004). `study_as_kanji` opts this word into the
  // Kanji deck; the `kanji_*` columns mirror the base SRS state above but track
  // an INDEPENDENT schedule for the kanji-only card. See lib/decks.ts.
  study_as_kanji: boolean;
  kanji_ease: number;
  kanji_interval_days: number;
  kanji_reps: number;
  kanji_lapses: number;
  kanji_state: "new" | "review" | "relearning";
  kanji_due_at: string | null;
  kanji_last_reviewed_at: string | null;
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
  study_as_kanji?: boolean; // also drill this word as a kanji-only card
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

// ---------------------------------------------------------------------------
// Smart Kanji deck (kanjiapi.dev + kanji_cards). See docs/spaced-repetition.md.
// ---------------------------------------------------------------------------

// One example word for a kanji (from kanjiapi.dev /v1/words/{char}).
export type KanjiWord = {
  written: string; // e.g. 朝食
  pronounced: string; // e.g. ちょうしょく
  glosses: string[]; // English meanings
};

// Normalized kanjiapi.dev data for a single kanji character.
export type KanjiInfo = {
  character: string;
  meanings: string[];
  on: string[]; // on'yomi (音読み)
  kun: string[]; // kun'yomi (訓読み)
  jlpt: number | null; // 5=N5 … 1=N1, null = not in JLPT
  grade: number | null;
  strokeCount: number | null;
  heisig: string | null;
  words: KanjiWord[]; // example words that use this kanji
};

// A smart-deck study item: one kanji as it appears in one of the user's words.
export type KanjiCard = {
  id: string;
  character: string;
  jlpt: number | null;
  word: string; // source word, e.g. 食べる
  reading: string | null; // the kanji's reading in this word, e.g. た
  word_reading: string | null; // full word reading, e.g. たべる
  word_meaning: string | null;
  vocab_id: string | null;
  created_at: string;
  // SRS state (base-named columns; scheduled by lib/srs.ts directly).
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  state: "new" | "review" | "relearning";
  due_at: string | null;
  last_reviewed_at: string | null;
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
