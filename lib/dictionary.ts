import {
  partOfSpeechToCategory,
  type DictEntry,
  type VocabInput,
} from "@/lib/types";

// Map a dictionary entry into a pre-filled vocab row for the "Add" dialog.
// Client-safe (no server-only imports) so the component can call it directly.
export function entryToVocabInput(entry: DictEntry): VocabInput {
  const firstSenses = entry.senses.slice(0, 2);
  const english = firstSenses
    .map((s) => s.englishDefinitions.join(", "))
    .filter(Boolean)
    .join("; ");
  const category = partOfSpeechToCategory(
    entry.senses[0]?.partsOfSpeech ?? []
  );
  return {
    kanji: entry.word || entry.reading,
    romaji: entry.romaji,
    english,
    tips: "",
    category,
  };
}
