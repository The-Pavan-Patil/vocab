import { createRequire } from "node:module";
import { NextResponse } from "next/server";
import { toHiragana, toRomaji } from "wanakana";
import type JishoApi from "unofficial-jisho-api";
import type { JishoResult } from "unofficial-jisho-api";
import type { DictEntry, DictMatchedForm } from "@/lib/types";
import { leadWith, mergeResults, romajiSearch } from "@/lib/romaji-search";
import { conjugationTable, entryClass, nameForm } from "@/lib/conjugation";
import { lookupDictionaryForm } from "@/lib/jotoba";
import { timed, withServerTiming } from "@/lib/server-timing";

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

const JAPANESE = /[ぁ-ゟ゠-ヿ㐀-䶿一-鿿々]/;

// GET /api/dictionary?q= — search words via Jisho (JMdict/KanjiDic sources).
// A romaji query may run a couple of extra searches (lib/romaji-search.ts) so
// "Taberu" or "koohii" find their words; the results come back merged.
// A conjugated form (行った, よくない, "tabeta") is looked up on Jotoba for its
// dictionary form, which then leads the results with `matchedForm` naming the
// form ("Past"). Without Jotoba the results are Jisho's alone.
export const GET = withServerTiming(async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const romaji = romajiSearch(q);
  // The query as Japanese, for the dictionary-form lookup: as typed, or the
  // romaji as kana (Jotoba doesn't read romaji).
  const asJapanese = romaji
    ? toHiragana(romaji.romaji)
    : JAPANESE.test(q)
      ? q
      : null;
  const [settled, dictionaryForm] = await Promise.all([
    Promise.allSettled(
      (romaji?.keys ?? [q]).map((key) => timed("jisho", jisho.searchForPhrase(key)))
    ),
    asJapanese
      ? timed("jotoba", lookupDictionaryForm(asJapanese)).catch(() => null)
      : null,
  ]);
  let lists = settled.flatMap((s) =>
    s.status === "fulfilled" ? [(s.value.data ?? []).map(toEntry)] : []
  );

  // A different dictionary form means the query was (probably) conjugated:
  // search that word too, and when the query is one of its table's forms,
  // put it first and say which form it was.
  let matchedForm: DictMatchedForm | null = null;
  let lead: DictEntry | undefined;
  if (
    asJapanese &&
    dictionaryForm &&
    lists.length > 0 &&
    dictionaryForm.word !== asJapanese &&
    dictionaryForm.kana !== asJapanese
  ) {
    const extra = await timed("jisho", jisho.searchForPhrase(dictionaryForm.word))
      .then((r) => (r.data ?? []).map(toEntry))
      .catch(() => [] as DictEntry[]);
    lead = extra.find(
      (e) => e.word === dictionaryForm.word && e.reading === dictionaryForm.kana
    ) ?? extra.find((e) => e.word === dictionaryForm.word);
    const cls = lead ? entryClass(lead.senses) : null;
    const label =
      lead && cls
        ? nameForm(asJapanese, conjugationTable(lead.word, lead.reading, cls))
        : null;
    if (lead && label) {
      matchedForm = { query: q, word: lead.word, label };
    } else {
      lead = undefined;
    }
    lists = [...lists, extra];
  }
  if (lists.length === 0) {
    const { reason } = settled[0] as PromiseRejectedResult;
    return NextResponse.json(
      { error: (reason as Error)?.message || "Dictionary search failed." },
      { status: 502 }
    );
  }
  const merged = mergeResults(lists, romaji?.romaji);
  return NextResponse.json({
    results: lead ? leadWith(merged, lead) : merged,
    matchedForm,
  });
});
