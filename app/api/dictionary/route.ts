import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { toRomaji } from "wanakana";
import type JishoApi from "unofficial-jisho-api";
import type { DictEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Load the CommonJS build at runtime — its ESM entry does `import cheerio from
// 'cheerio'`, which modern cheerio (no default export) can't satisfy under the
// bundler. createRequire resolves the package's "require" condition (index.cjs).
const require = createRequire(import.meta.url);
const JishoAPI = require("unofficial-jisho-api") as { new (): JishoApi };
const jisho = new JishoAPI();

// GET /api/dictionary?q= — search words via Jisho (JMdict/KanjiDic sources).
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  try {
    const res = await jisho.searchForPhrase(q);
    const results: DictEntry[] = (res.data ?? []).map((r) => {
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
    });
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Dictionary search failed." },
      { status: 502 }
    );
  }
}
