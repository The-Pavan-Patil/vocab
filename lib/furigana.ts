// ---------------------------------------------------------------------------
// Furigana segmentation — a kanji's reading *in a word*.
//
// Reuses the kuroshiro + kuromoji analyzer (lib/sentence-romaji.ts) in furigana
// mode, which emits okurigana-aware ruby HTML, then parses it into (surface,
// reading) segments. Server-only. kuroshiro keeps a kanji compound as one run
// (上手=じょうず); splitCompoundSegments divides it per kanji by the dictionary
// readings. Best-effort: jukujikun (今日=きょう) can't be divided and stay one
// run, so per-character readings aren't always known.
// ---------------------------------------------------------------------------

// `.ts` so Node's test runner resolves it; importing this module does NOT init
// kuromoji (the require is lazy inside getConverter), so the pure parser below
// stays testable without loading the heavy analyzer.
import { toHiragana } from "wanakana";
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
