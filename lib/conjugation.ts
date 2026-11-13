// ---------------------------------------------------------------------------
// Conjugation tables for dictionary results, generated locally with
// kamiya-codec (no API serves them). The verb or adjective class comes from
// Jisho's part-of-speech text ("Godan verb with 'ku' ending", "I-adjective
// (keiyoushi)"…). kamiya-codec covers the irregulars (する, 来る, 行く→行って,
// ある→ない, いい→よくない); the few forms it gets wrong for a learner (ichidan
// potential 食べれる, する's potential) are set here. Each form is built from
// the written word and from its kana reading, so the romaji follows the real
// pronunciation (来ない → konai). Pure, so it runs on the client (the table)
// and the server (naming a searched form), and the tests pin it down.
// ---------------------------------------------------------------------------

import {
  adjConjugate,
  conjugate,
  conjugateAuxiliaries,
  type AdjConjugation,
  type Auxiliary,
  type Conjugation,
} from "kamiya-codec";
import { toHiragana, toRomaji } from "wanakana";
import type { WordClass } from "./word-class.ts";

export { entryClass, wordClass, type WordClass } from "./word-class.ts";

export type ConjugatedForm = { text: string; reading: string; romaji: string };
export type ConjugationRow = {
  label: string;
  plain: ConjugatedForm;
  polite?: ConjugatedForm;
};
export type ConjugationTable = {
  cls: WordClass;
  basic: ConjugationRow[];
  more: ConjugationRow[];
};

// A conjugation spelt twice — once for the written word, once for its kana
// reading — from one recipe.
type Recipe = (base: string) => string;

const pick = (forms: string[], suffix?: string) =>
  (suffix ? forms.find((f) => f.endsWith(suffix)) : undefined) ?? forms[0];

// The verb as kamiya-codec takes it. する and 来る compounds (勉強する,
// 持って来る) conjugate their last verb; the rest is a fixed prefix.
function splitVerb(
  word: string,
  cls: WordClass
): { prefix: string; verb: string } {
  if (cls === "suru") {
    return word.endsWith("する")
      ? { prefix: word.slice(0, -2), verb: "する" }
      : { prefix: word, verb: "する" };
  }
  if (cls === "kuru") {
    for (const verb of ["来る", "くる", "來る"]) {
      if (word.endsWith(verb)) return { prefix: word.slice(0, -verb.length), verb };
    }
  }
  return { prefix: "", verb: word };
}

function verbRecipes(cls: WordClass, dictionary: string) {
  const typeII = cls === "ichidan";
  const c = (conj: Conjugation, suffix?: string): Recipe => (verb) =>
    pick(conjugate(verb, conj, typeII), suffix);
  const aux = (auxs: Auxiliary[], conj: Conjugation, suffix?: string): Recipe =>
    (verb) => pick(conjugateAuxiliaries(verb, auxs, conj, typeII), suffix);
  // The ます stem: 食べます → 食べ, the base of every polite form.
  const stem: Recipe = (verb) => aux(["Masu"], "Dictionary")(verb).slice(0, -2);
  const polite = (ending: string): Recipe => (verb) => stem(verb) + ending;

  // "Can do": 食べられる (not the casual 食べれる), できる, 来られる.
  const potential: Recipe = (verb) => {
    if (cls === "suru") return "できる";
    if (cls === "kuru") return verb.startsWith("来") || verb.startsWith("來")
      ? "来られる"
      : "こられる";
    if (cls === "ichidan") return aux(["ReruRareru"], "Dictionary")(verb);
    return aux(["Potential"], "Dictionary")(verb);
  };

  // ある has no potential, passive, causative, volitional or command a
  // learner would use.
  const isAru = ["ある", "有る", "在る"].includes(dictionary);

  const basic: [string, Recipe, Recipe?][] = [
    ["Present", c("Dictionary"), polite("ます")],
    ["Negative", aux(["Nai"], "Dictionary"), polite("ません")],
    ["Past", c("Ta"), polite("ました")],
    ["Past negative", aux(["Nai"], "Ta"), polite("ませんでした")],
    ["て-form", c("Te")],
  ];
  if (!isAru) {
    basic.push(
      ["Want to", aux(["Tai"], "Dictionary"), (v) => aux(["Tai"], "Dictionary")(v) + "です"],
      ["Can (potential)", potential, (v) => potential(v).slice(0, -1) + "ます"],
      ["Let's (volitional)", (v) => pickVolitional(conjugate(v, "Volitional", typeII)), polite("ましょう")],
      ["Command", c("Imperative")]
    );
  }
  const more: [string, Recipe, Recipe?][] = [
    ["If (〜ば)", c("Conditional", "ば")],
    ["If / when (〜たら)", c("Tara")],
  ];
  if (!isAru) {
    more.unshift(
      ["Passive", aux(["ReruRareru"], "Dictionary")],
      ["Causative", aux(["SeruSaseru"], "Dictionary")]
    );
  }
  return { basic, more };
}

// kamiya-codec gives both 書こ and 書こう, or 食べよう and 食べようう.
function pickVolitional(forms: string[]): string {
  return (
    forms.find((f) => f.endsWith("う") && !f.endsWith("うう")) ?? forms[0]
  );
}

function adjectiveRecipes(cls: WordClass) {
  const iAdjective = cls === "i-adj";
  const a = (conj: AdjConjugation, suffix?: string): Recipe => (adj) =>
    pick(adjConjugate(adj, conj, iAdjective), suffix);
  if (iAdjective) {
    const desu = (conj: AdjConjugation): Recipe => (adj) => a(conj)(adj) + "です";
    return {
      basic: [
        ["Present", a("Present"), desu("Present")],
        ["Negative", a("Negative"), desu("Negative")],
        ["Past", a("Past"), desu("Past")],
        ["Past negative", a("NegativePast"), desu("NegativePast")],
        ["て-form", a("ConjunctiveTe", "て")],
        ["Adverb", a("Adverbial")],
      ] as [string, Recipe, Recipe?][],
      more: [["If (〜ければ)", a("Conditional", "ば")]] as [string, Recipe, Recipe?][],
    };
  }
  return {
    basic: [
      ["Present", a("Present", "だ"), a("Present", "です")],
      ["Negative", a("Negative", "じゃない"), a("Negative", "ではありません")],
      ["Past", a("Past", "だった"), a("Past", "でした")],
      ["Past negative", a("NegativePast", "じゃなかった"), a("NegativePast", "ではありませんでした")],
      ["て-form", a("ConjunctiveTe")],
      ["Adverb", a("Adverbial")],
      ["Before a noun", a("Prenomial")],
    ] as [string, Recipe, Recipe?][],
    more: [["If (〜なら)", a("Conditional", "なら")]] as [string, Recipe, Recipe?][],
  };
}

// Compound いい adjectives (かっこいい) conjugate their いい as よい
// (かっこよくない); kamiya-codec only knows a bare いい.
function adjectiveBase(adj: string): { prefix: string; adj: string } {
  if (adj.length > 2 && adj.endsWith("いい")) {
    return { prefix: adj.slice(0, -2), adj: "よい" };
  }
  return { prefix: "", adj };
}

/**
 * The table for a word: the forms a beginner meets first, and the rest
 * behind "More forms". `reading` is the word's kana; it falls back to the
 * word when the word is kana already.
 */
export function conjugationTable(
  word: string,
  reading: string,
  cls: WordClass
): ConjugationTable {
  const kana = reading || word;
  const isVerb = cls !== "i-adj" && cls !== "na-adj";
  const recipes = isVerb ? verbRecipes(cls, word) : adjectiveRecipes(cls);

  const spell = (recipe: Recipe, text: string): string => {
    if (isVerb) {
      const { prefix, verb } = splitVerb(text, cls);
      return prefix + recipe(verb);
    }
    const { prefix, adj } = adjectiveBase(text);
    const out = prefix + recipe(adj);
    // A compound's present keeps its いい: かっこいい(です), not かっこよい.
    return prefix && out.startsWith(prefix + "よい")
      ? prefix + "いい" + out.slice(prefix.length + 2)
      : out;
  };
  const form = (recipe: Recipe): ConjugatedForm => {
    const reading = toHiragana(spell(recipe, kana), { passRomaji: true });
    return { text: spell(recipe, word), reading, romaji: toRomaji(reading) };
  };
  const rows = (list: [string, Recipe, Recipe?][]): ConjugationRow[] =>
    list.map(([label, plain, polite]) => ({
      label,
      plain: form(plain),
      ...(polite ? { polite: form(polite) } : {}),
    }));
  return { cls, basic: rows(recipes.basic), more: rows(recipes.more) };
}

/**
 * Which form of the word `query` is — "Past", "Negative, polite" — or null
 * when it isn't one of the table's forms (or is the dictionary form itself).
 * Matches the written form or the kana (a romaji query arrives as kana).
 */
export function nameForm(query: string, table: ConjugationTable): string | null {
  const q = query.trim();
  const kana = toHiragana(q, { passRomaji: true });
  const matches = (f: ConjugatedForm) => f.text === q || f.reading === kana;
  for (const row of [...table.basic, ...table.more]) {
    if (row.label === "Present" && matches(row.plain)) return null;
    if (matches(row.plain)) return row.label;
    if (row.polite && matches(row.polite)) {
      return row.label === "Present" ? "Polite" : `${row.label}, polite`;
    }
  }
  return null;
}
