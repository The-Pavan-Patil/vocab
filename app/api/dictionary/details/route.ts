import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import type JishoApi from "unofficial-jisho-api";
import { toSentenceRomaji } from "@/lib/sentence-romaji";
import { fetchKanjiInfo } from "@/lib/kanjiapi";
import { kanjiChars } from "@/lib/kanji-deck";
import type { DictExample, DictKanji, KanjiInfo } from "@/lib/types";

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

// GET /api/dictionary/details?word= — example sentences (Tatoeba) + per-kanji
// info (KanjiDic). Loaded lazily when a result is expanded; each source can
// fail independently without breaking the other.
export async function GET(request: Request) {
  const word = new URL(request.url).searchParams.get("word")?.trim() ?? "";
  if (!word) {
    return NextResponse.json({ examples: [], kanji: [] });
  }

  const examplesP = jisho
    .searchForExamples(word)
    .then((r) =>
      Promise.all(
        (r.results ?? []).slice(0, 5).map(
          async (s): Promise<DictExample> => ({
            japanese: s.kanji,
            kana: s.kana,
            romaji: await toSentenceRomaji(s.kanji),
            english: s.english,
          })
        )
      )
    )
    .catch(() => [] as DictExample[]);

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
}
