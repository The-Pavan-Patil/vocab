// ---------------------------------------------------------------------------
// Furigana segmentation — a kanji's reading *in a word*.
//
// Reuses the kuroshiro + kuromoji analyzer (lib/sentence-romaji.ts) in furigana
// mode, which emits okurigana-aware ruby HTML, then parses it into (surface,
// reading) segments. Server-only. Best-effort: jukujikun (今日=きょう) come back
// as a single unsplit kanji run, so per-character readings aren't always known.
// ---------------------------------------------------------------------------

// `.ts` so Node's test runner resolves it; importing this module does NOT init
// kuromoji (the require is lazy inside getConverter), so the pure parser below
// stays testable without loading the heavy analyzer.
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
