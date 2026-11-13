import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import type JishoApi from "unofficial-jisho-api";
import { toRomaji } from "wanakana";
import { toSentenceRomaji } from "@/lib/sentence-romaji";
import {
  parseJotobaFurigana,
  pickShortSentences,
  searchSentences,
  type JotobaSentence,
} from "@/lib/jotoba";
import { fetchKanjiInfo } from "@/lib/kanjiapi";
import { kanjiChars } from "@/lib/kanji-deck";
import type { DictExample, DictKanji, KanjiInfo } from "@/lib/types";
import { timed, withServerTiming } from "@/lib/server-timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Load the CommonJS build at runtime (see app/api/dictionary/route.ts).
const require = createRequire(import.meta.url);
const JishoAPI = require("unofficial-jisho-api") as { new (): JishoApi };
const jisho = new JishoAPI();

// kanjiapi.dev info → the DictKanji shape the details UI already renders.
function infoToDictKanji(info: KanjiInfo): DictKanji {
  return {
    char: info.character,
    meaning: info.meanings.join(", "),
    kunyomi: info.kun,
    onyomi: info.on,
    strokeCount: info.strokeCount != null ? String(info.strokeCount) : "",
    jlpt: info.jlpt != null ? `jlpt-n${info.jlpt}` : "",
  };
}

const EXAMPLES = 3;

// Romaji spaced by word (kuroshiro), or straight from the furigana reading
// when that fails.
async function sentenceRomaji(japanese: string, reading: string) {
  return (await toSentenceRomaji(japanese)) || toRomaji(reading);
}

async function jotobaExample(s: JotobaSentence): Promise<DictExample> {
  const segments = parseJotobaFurigana(s.furigana);
  const kana = segments.map((segment) => segment.reading).join("");
  return {
    japanese: s.content,
    kana,
    romaji: await sentenceRomaji(s.content, kana),
    english: s.translation,
    segments,
  };
}

// The few shortest sentences, from Jotoba (with furigana); Jisho's Tatoeba
// search, held to the same length rule, when Jotoba fails or has none.
async function shortExamples(word: string): Promise<DictExample[]> {
  const fromJotoba = await timed("jotoba", searchSentences(word))
    .then((sentences) => pickShortSentences(sentences, word, EXAMPLES))
    .catch(() => [] as JotobaSentence[]);
  if (fromJotoba.length > 0) return Promise.all(fromJotoba.map(jotobaExample));

  const r = await timed("jisho", jisho.searchForExamples(word));
  const candidates = (r.results ?? []).map((s) => ({
    content: s.kanji,
    furigana: s.kanji,
    translation: s.english,
    kana: s.kana,
  }));
  // Jisho's first page often has no short sentence; then just its two
  // shortest, rather than none.
  const short = pickShortSentences(candidates, word, EXAMPLES);
  const picked = (
    short.length > 0
      ? short
      : pickShortSentences(candidates, word, 2, Number.POSITIVE_INFINITY)
  ) as (JotobaSentence & { kana: string })[];
  return Promise.all(
    picked.map(async (s) => ({
      japanese: s.content,
      kana: s.kana,
      romaji: await sentenceRomaji(s.content, s.kana),
      english: s.translation,
    }))
  );
}

// GET /api/dictionary/details?word= — a few short example sentences (Tatoeba,
// via Jotoba or Jisho) + per-kanji info (KanjiDic). Loaded lazily when a
// result is expanded; each source can fail independently without breaking
// the other.
export const GET = withServerTiming(async function GET(request: Request) {
  const word = new URL(request.url).searchParams.get("word")?.trim() ?? "";
  if (!word) {
    return NextResponse.json({ examples: [], kanji: [] });
  }

  const examplesP = shortExamples(word).catch(() => [] as DictExample[]);

  // Per-kanji breakdown now comes from kanjiapi.dev (richer + faster than the
  // Jisho kanji scrape): readings, meanings, JLPT, stroke count.
  const kanjiP = Promise.all(
    kanjiChars(word).map((c) =>
      fetchKanjiInfo(c)
        .then((info) => (info ? infoToDictKanji(info) : null))
        .catch(() => null)
    )
  ).then((arr) => arr.filter((k): k is DictKanji => k !== null));

  const [examples, kanji] = await Promise.all([examplesP, kanjiP]);
  return NextResponse.json({ examples, kanji });
});
