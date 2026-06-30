// ---------------------------------------------------------------------------
// kanjiapi.dev client — kanji readings, JLPT level, and example words.
//
// Free, no API key, KANJIDIC2/JMdict-backed. `fetchKanjiInfo` is network-only;
// `getKanji` adds a DB cache (the `kanji` table) for authenticated contexts so we
// don't re-hit the API for static reference data. Server-side (uses global fetch).
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KanjiInfo, KanjiWord } from "./types";

const BASE = "https://kanjiapi.dev/v1";
const MAX_WORDS = 12; // cap example words per kanji

// Raw kanjiapi.dev shapes.
type RawKanji = {
  kanji?: string;
  meanings?: string[];
  on_readings?: string[];
  kun_readings?: string[];
  jlpt?: number | null;
  grade?: number | null;
  stroke_count?: number | null;
  heisig_en?: string | null;
};
type RawWord = {
  variants?: { written?: string; pronounced?: string }[];
  meanings?: { glosses?: string[] }[];
};

/**
 * Fetch + normalize kanjiapi.dev data for one kanji character. Network only (no
 * DB). Returns null if the character isn't a known kanji (kanjiapi 404s).
 */
export async function fetchKanjiInfo(character: string): Promise<KanjiInfo | null> {
  const enc = encodeURIComponent(character);
  const [kRes, wRes] = await Promise.all([
    fetch(`${BASE}/kanji/${enc}`),
    fetch(`${BASE}/words/${enc}`).catch(() => null),
  ]);
  if (!kRes.ok) return null; // 404 → not a known kanji
  const k = (await kRes.json()) as RawKanji;
  const rawWords = wRes && wRes.ok ? ((await wRes.json()) as RawWord[]) : [];
  return normalizeKanji(k, rawWords, character);
}

/** Pure normalization of the two kanjiapi.dev payloads into our `KanjiInfo`. */
export function normalizeKanji(
  k: RawKanji,
  rawWords: RawWord[],
  fallbackChar: string
): KanjiInfo {
  const words: KanjiWord[] = rawWords
    .map((w): KanjiWord | null => {
      const v = w.variants?.[0];
      if (!v?.written) return null;
      const glosses = (w.meanings ?? []).flatMap((m) => m.glosses ?? []);
      return { written: v.written, pronounced: v.pronounced ?? "", glosses };
    })
    .filter((w): w is KanjiWord => w !== null)
    .slice(0, MAX_WORDS);

  return {
    character: k.kanji ?? fallbackChar,
    meanings: k.meanings ?? [],
    on: k.on_readings ?? [],
    kun: k.kun_readings ?? [],
    jlpt: k.jlpt ?? null,
    grade: k.grade ?? null,
    strokeCount: k.stroke_count ?? null,
    heisig: k.heisig_en ?? null,
    words,
  };
}

// A cached `kanji` row → KanjiInfo (jsonb columns arrive already parsed).
function rowToInfo(row: Record<string, unknown>): KanjiInfo {
  return {
    character: row.character as string,
    meanings: (row.meanings as string[]) ?? [],
    on: (row.on_readings as string[]) ?? [],
    kun: (row.kun_readings as string[]) ?? [],
    jlpt: (row.jlpt as number | null) ?? null,
    grade: (row.grade as number | null) ?? null,
    strokeCount: (row.stroke_count as number | null) ?? null,
    heisig: (row.heisig_en as string | null) ?? null,
    words: (row.words as KanjiWord[]) ?? [],
  };
}

/**
 * Get kanji info using the `kanji` table as a cache. On miss, fetch from
 * kanjiapi.dev and upsert. Returns null for non-kanji. Pass an RLS-scoped client.
 */
export async function getKanji(
  supabase: SupabaseClient,
  character: string
): Promise<KanjiInfo | null> {
  const { data: cached } = await supabase
    .from("kanji")
    .select("*")
    .eq("character", character)
    .maybeSingle();
  if (cached) return rowToInfo(cached);

  const info = await fetchKanjiInfo(character);
  if (!info) return null;

  await supabase.from("kanji").upsert({
    character: info.character,
    meanings: info.meanings,
    on_readings: info.on,
    kun_readings: info.kun,
    jlpt: info.jlpt,
    grade: info.grade,
    stroke_count: info.strokeCount,
    heisig_en: info.heisig,
    words: info.words,
  });
  return info;
}
