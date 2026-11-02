"""Build a reviewable patch without modifying the restricted app source tree."""

from difflib import unified_diff
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STAGED = Path(__file__).resolve().parent


def change(path: str, replacements: list[tuple[str, str]]) -> str:
    original = (ROOT / path).read_text()
    updated = original
    for before, after in replacements:
        if updated.count(before) != 1:
            raise RuntimeError(f"Expected one match in {path}: {before[:50]!r}")
        updated = updated.replace(before, after, 1)
    return "".join(
        unified_diff(
            original.splitlines(keepends=True),
            updated.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        )
    )


patches = []

patches.append(
    change(
        "lib/sentence-romaji.ts",
        [
            (
                "export type Converter = {\n  convert: (text: string, opts: Record<string, unknown>) => Promise<string>;\n};\n",
                "export type Converter = {\n  convert: (text: string, opts: Record<string, unknown>) => Promise<string>;\n};\n\nexport type JapaneseToken = {\n  surface_form: string;\n  basic_form: string;\n  pos: string;\n  pos_detail_1: string;\n};\n\ntype Analyzer = { parse: (text: string) => Promise<JapaneseToken[]> };\nlet analyzer: Analyzer | null = null;\n",
            ),
            (
                "      const k = new Kuroshiro();\n      await k.init(\n        new KuromojiAnalyzer({\n          dictPath: path.join(process.cwd(), \"node_modules/kuromoji/dict\"),\n        })\n      );\n",
                "      const k = new Kuroshiro();\n      const nextAnalyzer = new KuromojiAnalyzer({\n        dictPath: path.join(process.cwd(), \"node_modules/kuromoji/dict\"),\n      }) as Analyzer;\n      await k.init(nextAnalyzer);\n      analyzer = nextAnalyzer;\n",
            ),
            (
                "export async function toSentenceRomaji(text: string): Promise<string> {",
                "// Reuse the tokenizer already loaded for example readings when resolving\n// dictionary inflections. This stays on the server.\nexport async function tokenizeJapanese(text: string): Promise<JapaneseToken[]> {\n  await getConverter();\n  return analyzer?.parse(text) ?? [];\n}\n\nexport async function toSentenceRomaji(text: string): Promise<string> {",
            ),
        ],
    )
)

patches.append(
    change(
        "lib/types.ts",
        [
            (
                "  romaji: string; // reading converted to romaji\n  isCommon: boolean;",
                "  romaji: string; // reading converted to romaji\n  matchedForm?: string; // inflected query that resolved to this headword\n  isCommon: boolean;",
            )
        ],
    )
)

patches.append(
    change(
        "app/api/dictionary/route.ts",
        [
            (
                'import type JishoApi from "unofficial-jisho-api";\nimport type { DictEntry } from "@/lib/types";',
                'import type JishoApi from "unofficial-jisho-api";\nimport type { JishoResult } from "unofficial-jisho-api";\nimport { tokenizeJapanese } from "@/lib/sentence-romaji";\nimport { wordFormCandidates, type WordFormCandidate } from "@/lib/word-forms";\nimport type { DictEntry } from "@/lib/types";',
            ),
            (
                "// GET /api/dictionary?q= — search words via Jisho (JMdict/KanjiDic sources).",
                '''function hasExactForm(entry: JishoResult, word: string): boolean {
  return entry.japanese.some((form) =>
    form.word === word || form.reading === word
  );
}

function matchesCandidate(
  entry: JishoResult,
  candidate: WordFormCandidate
): boolean {
  if (!hasExactForm(entry, candidate.word)) return false;
  const pos = entry.senses.flatMap((sense) => sense.parts_of_speech).join(" ").toLowerCase();
  return candidate.kind === "verb"
    ? pos.includes("verb")
    : pos.includes("noun") || pos.includes("suru verb");
}

function toDictEntry(entry: JishoResult, matchedForm?: string): DictEntry {
  const reading = entry.japanese[0]?.reading ?? "";
  const word = entry.japanese[0]?.word ?? reading;
  return {
    slug: entry.slug,
    word,
    reading,
    romaji: reading ? toRomaji(reading) : "",
    matchedForm,
    isCommon: Boolean(entry.is_common),
    jlpt: entry.jlpt ?? [],
    senses: (entry.senses ?? []).map((sense) => ({
      englishDefinitions: sense.english_definitions ?? [],
      partsOfSpeech: sense.parts_of_speech ?? [],
      tags: sense.tags ?? [],
    })),
  };
}

// GET /api/dictionary?q= — search words via Jisho (JMdict/KanjiDic sources).''',
            ),
            (
                '''    const res = await jisho.searchForPhrase(q);
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
    return NextResponse.json({ results });''',
                '''    const res = await jisho.searchForPhrase(q);
    const direct = res.data ?? [];
    let formMatches: JishoResult[] = [];

    // Direct headwords keep their normal ranking. For other Japanese queries,
    // look up Kuromoji's base form and validate it against an exact JMdict form
    // and part of speech before adding it to the result list.
    if (
      !direct.some((entry) => hasExactForm(entry, q)) &&
      /[\\u3040-\\u30ff\\u3400-\\u9fff]/u.test(q) &&
      q.length <= 40
    ) {
      try {
        const candidates = wordFormCandidates(q, await tokenizeJapanese(q));
        const found = await Promise.all(
          candidates.map(async (candidate) => {
            try {
              const response = await jisho.searchForPhrase(candidate.word);
              return (response.data ?? []).filter((entry) =>
                matchesCandidate(entry, candidate)
              );
            } catch {
              return [] as JishoResult[];
            }
          })
        );
        formMatches = found.flat();
      } catch {
        // Tokenizer failure should not hide ordinary dictionary results.
      }
    }

    const results = new Map<string, DictEntry>();
    for (const entry of formMatches) {
      if (!results.has(entry.slug)) results.set(entry.slug, toDictEntry(entry, q));
    }
    for (const entry of direct) {
      if (!results.has(entry.slug)) results.set(entry.slug, toDictEntry(entry));
    }
    return NextResponse.json({ results: [...results.values()] });''',
            ),
        ],
    )
)

patches.append(
    change(
        "components/DictionarySearch.tsx",
        [
            (
                'Search by English meaning, Japanese (kanji or kana) or romaji.',
                'Search by English meaning, Japanese word or form, or romaji.',
            ),
            (
                '''                  {(entry.isCommon || jlpt) && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.isCommon && (''',
                '''                  {(entry.matchedForm || entry.isCommon || jlpt) && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.matchedForm && (
                        <Badge variant="outline" lang="ja" translate="no">
                          Matched: {entry.matchedForm}
                        </Badge>
                      )}
                      {entry.isCommon && (''',
            ),
        ],
    )
)

for name in ("word-forms.ts", "word-forms.test.ts"):
    source = (STAGED / name).read_text()
    path = f"lib/{name}"
    patches.append(
        "".join(
            unified_diff(
                [],
                source.splitlines(keepends=True),
                fromfile="/dev/null",
                tofile=f"b/{path}",
            )
        )
    )

(STAGED / "dictionary-form-search.patch").write_text("".join(patches))
print(STAGED / "dictionary-form-search.patch")
