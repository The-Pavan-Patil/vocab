import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import type JishoApi from "unofficial-jisho-api";
import { toSentenceRomaji } from "@/lib/sentence-romaji";
import type { DictExample, DictKanji } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Load the CommonJS build at runtime (see app/api/dictionary/route.ts).
const require = createRequire(import.meta.url);
const JishoAPI = require("unofficial-jisho-api") as { new (): JishoApi };
const jisho = new JishoAPI();

// Unique CJK ideographs (kanji) within a word.
function kanjiChars(word: string): string[] {
  const matches = word.match(/[一-龯㐀-䶿]/g) ?? [];
  return [...new Set(matches)];
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

  const kanjiP = Promise.all(
    kanjiChars(word).map((c) =>
      jisho
        .searchForKanji(c)
        .then((k): DictKanji | null =>
          k.found
            ? {
                char: c,
                meaning: k.meaning ?? "",
                kunyomi: k.kunyomi ?? [],
                onyomi: k.onyomi ?? [],
                strokeCount: k.strokeCount ?? "",
                jlpt: k.jlptLevel ?? "",
              }
            : null
        )
        .catch(() => null)
    )
  ).then((arr) => arr.filter((k): k is DictKanji => k !== null));

  const [examples, kanji] = await Promise.all([examplesP, kanjiP]);
  return NextResponse.json({ examples, kanji });
}
