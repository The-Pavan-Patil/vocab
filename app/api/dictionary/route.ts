import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { toRomaji } from "wanakana";
import type JishoApi from "unofficial-jisho-api";
import type { JishoResult } from "unofficial-jisho-api";
import type { DictEntry } from "@/lib/types";
import { mergeResults, romajiSearch } from "@/lib/romaji-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Load the CommonJS build at runtime — its ESM entry does `import cheerio from
// 'cheerio'`, which modern cheerio (no default export) can't satisfy under the
// bundler. createRequire resolves the package's "require" condition (index.cjs).
const require = createRequire(import.meta.url);
const JishoAPI = require("unofficial-jisho-api") as { new (): JishoApi };
const jisho = new JishoAPI();

function toEntry(r: JishoResult): DictEntry {
  const reading = r.japanese[0]?.reading ?? "";
  const word = r.japanese[0]?.word ?? reading;
  return {
    slug: r.slug,
    word,
    reading,
    romaji: reading ? toRomaji(reading) : "",
    isCommon: Boolean(r.is_common),
    jlpt: r.jlpt ?? [],
    senses: (r.senses ?? []).map((s) => ({
      englishDefinitions: s.english_definitions ?? [],
      partsOfSpeech: s.parts_of_speech ?? [],
      tags: s.tags ?? [],
    })),
  };
}

// GET /api/dictionary?q= — search words via Jisho (JMdict/KanjiDic sources).
// A romaji query may run a couple of extra searches (lib/romaji-search.ts) so
// "Taberu" or "koohii" find their words; the results come back merged.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const romaji = romajiSearch(q);
  const settled = await Promise.allSettled(
    (romaji?.keys ?? [q]).map((key) => jisho.searchForPhrase(key))
  );
  const lists = settled.flatMap((s) =>
    s.status === "fulfilled" ? [(s.value.data ?? []).map(toEntry)] : []
  );
  if (lists.length === 0) {
    const { reason } = settled[0] as PromiseRejectedResult;
    return NextResponse.json(
      { error: (reason as Error)?.message || "Dictionary search failed." },
      { status: 502 }
    );
  }
  return NextResponse.json({ results: mergeResults(lists, romaji?.romaji) });
}
