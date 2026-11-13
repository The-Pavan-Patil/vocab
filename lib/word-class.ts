// A dictionary word's conjugation class, from Jisho's part-of-speech text.
// Kept apart from lib/conjugation.ts (which pulls in kamiya-codec) so the
// Dictionary screen can tell which results conjugate without loading the
// conjugator until a table is opened.

export type WordClass =
  | "godan"
  | "ichidan"
  | "suru"
  | "kuru"
  | "i-adj"
  | "na-adj";

/**
 * The conjugation class from a sense's parts of speech, or null when the
 * word doesn't conjugate (nouns, adverbs…). A noun that also takes する
 * ("Noun, Suru verb" — 勉強) counts as a する verb: 勉強する.
 */
export function wordClass(partsOfSpeech: string[]): WordClass | null {
  const pos = partsOfSpeech.map((p) => p.toLowerCase());
  const has = (text: string) => pos.some((p) => p.includes(text));
  if (has("kuru verb")) return "kuru";
  if (has("suru verb")) return "suru";
  // Not the classical -zuru alternative forms, which conjugate differently.
  if (has("ichidan verb") && !has("zuru")) return "ichidan";
  if (has("godan verb")) return "godan";
  if (has("i-adjective")) return "i-adj";
  if (has("na-adjective")) return "na-adj";
  return null;
}

/** The first class any sense gives (verbs and adjectives lead their senses). */
export function entryClass(senses: { partsOfSpeech: string[] }[]): WordClass | null {
  for (const sense of senses) {
    const cls = wordClass(sense.partsOfSpeech);
    if (cls) return cls;
  }
  return null;
}
