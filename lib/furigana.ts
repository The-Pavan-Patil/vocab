// ---------------------------------------------------------------------------
// Furigana segmentation — a kanji's reading *in a word*.
//
// Reuses the kuroshiro + kuromoji analyzer (lib/sentence-romaji.ts) in furigana
// mode, which emits okurigana-aware ruby HTML, then parses it into (surface,
// reading) segments. Server-only. kuroshiro keeps a kanji compound as one run
// (上手=じょうず); splitCompoundSegments divides it per kanji by the dictionary
// readings. Best-effort: jukujikun (今日=きょう) can't be divided and stay one
// run, so per-character readings aren't always known. The analyzer guesses a
// bare word's reading, so segmentsFromRomaji re-reads the word from its saved
// romaji when the two disagree.
// ---------------------------------------------------------------------------

// `.ts` so Node's test runner resolves it; importing this module does NOT init
// kuromoji (the require is lazy inside getConverter), so the pure parser below
// stays testable without loading the heavy analyzer.
import { isKana, toHiragana, toRomaji } from "wanakana";
import { getConverter } from "./sentence-romaji.ts";

export type FuriganaSegment = {
  surface: string; // the written segment, e.g. 食 or べる
  reading: string; // its kana reading (== surface for kana segments)
  isKanji: boolean; // whether the surface contains a kanji
};

const HAS_KANJI = /[一-龯㐀-䶿]/;
const isKanjiChar = (c: string) => HAS_KANJI.test(c);

/**
 * Split a Japanese word into (surface, reading) segments. 食べる →
 * [{食, た}, {べる, べる}]; 食事 → [{食, しょく}, {事, じ}].
 */
export async function segment(word: string): Promise<FuriganaSegment[]> {
  const w = word.trim();
  if (!w) return [];
  const k = await getConverter();
  // Furigana mode → ruby HTML, e.g. <ruby>食<rp>(</rp><rt>た</rt><rp>)</rp></ruby>べる
  const html = await k.convert(w, { to: "hiragana", mode: "furigana" });
  return parseFuriganaHtml(html);
}

/** Reconstruct the full kana reading of a word from its segments. */
export function fullReading(segments: FuriganaSegment[]): string {
  return segments.map((s) => s.reading).join("");
}

/**
 * The full reading with a dot at each segment boundary, KANJIDIC-style, so the
 * kanji reading reads apart from its okurigana: 行く → "い.く", 食べる → "た.べる",
 * 食事 → "しょく.じ". A single-segment word (e.g. a jukujikun run) has no dot.
 */
export function dottedReading(segments: FuriganaSegment[]): string {
  return segments.map((s) => s.reading).join(".");
}

/**
 * Map each kanji that sits ALONE in its segment to its reading. Multi-kanji runs
 * (jukujikun like 今日=きょう) are skipped — we don't claim a per-character reading
 * we can't actually isolate.
 */
export function singleKanjiReadings(
  segments: FuriganaSegment[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of segments) {
    if (!s.isKanji) continue;
    const kanji = [...s.surface].filter(isKanjiChar);
    if (kanji.length === 1 && !map.has(kanji[0])) {
      map.set(kanji[0], s.reading);
    }
  }
  return map;
}

// Rendaku: a kanji past the first in a compound may voice its first kana
// (本棚 = ほん + だな, from たな).
const VOICED: Record<string, string[]> = {
  か: ["が"], き: ["ぎ"], く: ["ぐ"], け: ["げ"], こ: ["ご"],
  さ: ["ざ"], し: ["じ"], す: ["ず"], せ: ["ぜ"], そ: ["ぞ"],
  た: ["だ"], ち: ["ぢ"], つ: ["づ"], て: ["で"], と: ["ど"],
  は: ["ば", "ぱ"], ひ: ["び", "ぴ"], ふ: ["ぶ", "ぷ"], へ: ["べ", "ぺ"], ほ: ["ぼ", "ぽ"],
};

// Gemination: a kanji before the last may swap these final kana for っ
// (学校 = がっ + こう, from がく).
const GEMINATING = new Set(["つ", "ち", "く", "き"]);

/**
 * A kanji's dictionary readings (kanjiapi on/kun) as hiragana stems:
 * ジョウ → じょう, あ.げる → あ, -うえ → うえ. The markers come off before the
 * kana conversion, which would otherwise turn them into ー and 。.
 */
export function readingStems(readings: string[]): string[] {
  const stems = readings
    .map((reading) => reading.replace(/-/g, "").split(".")[0])
    .filter(Boolean)
    .map((stem) => toHiragana(stem));
  return [...new Set(stems)];
}

/** Every form a kanji's stems can take at this position in a compound. */
function compoundForms(stems: string[], first: boolean, last: boolean): Set<string> {
  const forms = new Set<string>();
  for (const stem of stems) {
    const starts = [stem];
    if (!first) {
      for (const voiced of VOICED[stem[0]] ?? []) starts.push(voiced + stem.slice(1));
    }
    for (const start of starts) {
      forms.add(start);
      if (!last && start.length > 1 && GEMINATING.has(start[start.length - 1])) {
        forms.add(start.slice(0, -1) + "っ");
      }
    }
  }
  return forms;
}

/** The one way to cut `reading` into a form per kanji, or null if none or several. */
function alignReading(reading: string, forms: Set<string>[]): string[] | null {
  const found: string[][] = [];
  const walk = (at: number, index: number, pieces: string[]) => {
    if (found.length > 1) return;
    if (index === forms.length) {
      if (at === reading.length) found.push(pieces);
      return;
    }
    for (const form of forms[index]) {
      if (reading.startsWith(form, at)) {
        walk(at + form.length, index + 1, [...pieces, form]);
      }
    }
  };
  walk(0, 0, []);
  return found.length === 1 ? found[0] : null;
}

/**
 * Split each all-kanji run into one segment per kanji when its reading lines
 * up with the kanji's dictionary readings in exactly one way: kuroshiro keeps
 * 上手 as a single じょうず run, which becomes 上=じょう + 手=ず. Runs that don't
 * line up (jukujikun such as 今日=きょう, 大人=おとな) or line up ambiguously stay
 * whole, so no per-kanji reading is guessed. `readingsOf` gives a kanji's raw
 * on/kun readings; an empty list leaves its run whole.
 */
export function splitCompoundSegments(
  segments: FuriganaSegment[],
  readingsOf: (character: string) => string[]
): FuriganaSegment[] {
  return segments.flatMap((segment) => {
    const characters = [...segment.surface];
    if (
      !segment.isKanji ||
      characters.length < 2 ||
      !characters.every(isKanjiChar)
    ) {
      return [segment];
    }
    const pieces = alignReading(
      segment.reading,
      characters.map((character, index) =>
        compoundForms(
          readingStems(readingsOf(character)),
          index === 0,
          index === characters.length - 1
        )
      )
    );
    return pieces
      ? characters.map((character, index) => ({
          surface: character,
          reading: pieces[index],
          isKanji: true,
        }))
      : [segment];
  });
}

// ---------------------------------------------------------------------------
// The word's saved romaji as a check on the analyzer. kuromoji reads a bare
// word with no context, so counters lose their sound changes (一本 = いちほん),
// special readings are missed (一人 = いちにん, 六日 = ろくにち), digits go
// unread (9月 = 9 + つき) and a lone kanji can get an odd pick (金 = きむ). The
// romaji saved on the word is curated, so when it says something else the
// word is re-read from it.
// ---------------------------------------------------------------------------

/**
 * A loose spelling key, so romaji written differently for the same sounds
 * compares equal: case, apostrophes, spaces, macrons and vowel length aside
 * (Tōkyō = toukyou = tokyo, kin'youbi = kinyoubi, sensei = sensē).
 */
export function looseRomajiKey(romaji: string): string {
  return romaji
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]/g, "")
    .replace(/ou|ei/g, (pair) => pair[0])
    .replace(/([aiueo])\1+/g, "$1");
}

/**
 * Saved romaji as hiragana (sen'en → せんえん, Tōkyō → とうきょう), or null when
 * it doesn't read as romaji throughout.
 */
export function kanaFromRomaji(romaji: string): string | null {
  const spelled = romaji
    .trim()
    // Lowercase first: wanakana turns capitals into katakana.
    .toLowerCase()
    .normalize("NFD")
    .replace(/([aiueo])[̂̄]/g, (_, vowel: string) =>
      vowel === "o" ? "ou" : vowel + vowel
    )
    .replace(/\s+/g, "");
  if (!spelled) return null;
  const kana = toHiragana(spelled);
  return isKana(kana) ? kana : null;
}

// Kana as written in a word. ヵ/ヶ (一ヶ月 = いっかげつ) and digits read like
// kanji, so they sit in the runs that take a reading.
const KANA_CHAR = /[ぁ-ゔゝゞァ-ヴヽヾー]/;

function wordRuns(word: string): { surface: string; kana: boolean }[] {
  const runs: { surface: string; kana: boolean }[] = [];
  for (const character of word) {
    const kana = KANA_CHAR.test(character);
    const last = runs[runs.length - 1];
    if (last && last.kana === kana) last.surface += character;
    else runs.push({ surface: character, kana });
  }
  return runs;
}

// Kana match as hiragana (wanakana reads ー as う after o: ノート = のうと), or
// as romaji (where ー doubles the vowel: コーヒー = koohii = こおひい). Not by
// the loose key: dropping vowel length would let the next run take a vowel.
const sameKana = (written: string, slice: string) =>
  toHiragana(written) === toHiragana(slice);
const sameRomaji = (written: string, slice: string) =>
  toRomaji(written) === toRomaji(slice);

/**
 * Line a full reading up with the word: its kana must read as written, and
 * each other run (kanji, digits) takes the kana between them — 夜が明ける with
 * よがあける → 夜=よ, が, 明=あ, ける. Null unless exactly one way fits.
 */
export function alignReadingToWord(
  word: string,
  reading: string
): FuriganaSegment[] | null {
  const runs = wordRuns(word.trim());
  if (runs.length === 0 || !reading) return null;
  for (const same of [sameKana, sameRomaji]) {
    const found: string[][] = [];
    const walk = (at: number, index: number, pieces: string[]) => {
      if (found.length > 1) return;
      if (index === runs.length) {
        if (at === reading.length) found.push(pieces);
        return;
      }
      const run = runs[index];
      const last = index === runs.length - 1;
      for (let end = last ? reading.length : at + 1; end <= reading.length; end++) {
        const slice = reading.slice(at, end);
        if (!slice || (run.kana && !same(run.surface, slice))) continue;
        walk(end, index + 1, [...pieces, slice]);
      }
    };
    walk(0, 0, []);
    if (found.length > 1) return null;
    if (found.length === 1) {
      return runs.map((run, index) =>
        run.kana
          ? { surface: run.surface, reading: run.surface, isKanji: false }
          : {
              surface: run.surface,
              reading: found[0][index],
              isKanji: HAS_KANJI.test(run.surface),
            }
      );
    }
  }
  return null;
}

/**
 * The word re-read from its saved romaji when the analyzer's reading sounds
 * different (一本: いちほん vs "ippon" → いっぽん). Null keeps the analyzer's
 * segments: there's no romaji, it agrees once spelling is set aside, it isn't
 * romaji, or it can't be lined up with the word's kana.
 */
export function segmentsFromRomaji(
  word: string,
  romaji: string | null | undefined,
  analyzed: FuriganaSegment[]
): FuriganaSegment[] | null {
  const saved = romaji ? looseRomajiKey(romaji) : "";
  if (!saved || looseRomajiKey(toRomaji(fullReading(analyzed))) === saved) {
    return null;
  }
  const reading = kanaFromRomaji(romaji!);
  return reading ? alignReadingToWord(word, reading) : null;
}

// Parse kuroshiro furigana HTML into ordered segments. <rp> fallback parens are
// dropped; each <ruby> may hold several base+<rt> pairs; text outside <ruby> is
// kana (reading == surface). Exported for unit testing (no kuroshiro needed).
export function parseFuriganaHtml(html: string): FuriganaSegment[] {
  const cleaned = html.replace(/<rp>.*?<\/rp>/g, "");
  const segments: FuriganaSegment[] = [];
  const rubyRe = /<ruby>(.*?)<\/ruby>/g;
  let last = 0;
  let m: RegExpExecArray | null;

  const pushKana = (text: string) => {
    if (text) segments.push({ surface: text, reading: text, isKanji: false });
  };

  while ((m = rubyRe.exec(cleaned)) !== null) {
    pushKana(cleaned.slice(last, m.index));
    last = m.index + m[0].length;
    // Inside a ruby: pairs of (base)<rt>(reading)</rt>.
    const pairRe = /([^<]*)<rt>(.*?)<\/rt>/g;
    let p: RegExpExecArray | null;
    while ((p = pairRe.exec(m[1])) !== null) {
      const surface = p[1];
      const reading = p[2];
      if (surface) {
        segments.push({ surface, reading, isKanji: HAS_KANJI.test(surface) });
      }
    }
  }
  pushKana(cleaned.slice(last));
  return segments;
}
