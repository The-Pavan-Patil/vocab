// ---------------------------------------------------------------------------
// Jotoba (https://jotoba.de) — a free Japanese dictionary API, no key. Used
// for two things Jisho does poorly:
//  - short example sentences with furigana (Tatoeba's corpus, CC BY 2.0 FR),
//    shortest first, so a beginner gets "高いな！" before a paragraph;
//  - finding the dictionary form of a conjugated search (行った → 行く,
//    よくない → 良い), which Jisho's search often misses.
// Every call has a short timeout and callers fall back to Jisho alone, so the
// dictionary works as before when Jotoba is slow or down. The parsing and
// picking below are pure for the tests.
// ---------------------------------------------------------------------------

import type { FuriganaSegment } from "./furigana.ts";

const JOTOBA = process.env.JOTOBA_URL || "https://jotoba.de";

export type JotobaSentence = {
  content: string; // 高いな！
  furigana: string; // [高|たか]いな！
  translation: string; // That's expensive!
};

type JotobaWord = { reading: { kana: string; kanji?: string } };

async function post<T>(path: string, body: object, timeoutMs: number): Promise<T> {
  const res = await fetch(`${JOTOBA}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, language: "English", no_english: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Jotoba ${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Example sentences for a word or phrase, in Jotoba's order. */
export async function searchSentences(
  query: string,
  timeoutMs = 4000
): Promise<JotobaSentence[]> {
  const json = await post<{ sentences?: JotobaSentence[] }>(
    "/api/search/sentences",
    { query },
    timeoutMs
  );
  return json.sentences ?? [];
}

/**
 * The dictionary form Jotoba matches a (possibly conjugated) Japanese query
 * to — its first word's written form, or its kana when it has no kanji.
 */
export async function lookupDictionaryForm(
  query: string,
  timeoutMs = 2500
): Promise<{ word: string; kana: string } | null> {
  const json = await post<{ words?: JotobaWord[] }>(
    "/api/search/words",
    { query },
    timeoutMs
  );
  const top = json.words?.[0]?.reading;
  return top ? { word: top.kanji || top.kana, kana: top.kana } : null;
}

const KANJI = /[㐀-䶿一-鿿々〆ヵヶ]/;

/**
 * Jotoba's furigana markup as segments: `[高|たか]いな！` is 高 read たか, then
 * kana. A group with one reading per character (`[日本語|に|ほん|ご]`) splits
 * per kanji; one reading for the group (`[今日|きょう]`) stays whole.
 */
export function parseJotobaFurigana(markup: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  const plain = (text: string) => {
    if (text) segments.push({ surface: text, reading: text, isKanji: false });
  };
  const group = /\[([^\]|]+)((?:\|[^\]|]*)+)\]/g;
  let at = 0;
  for (const match of markup.matchAll(group)) {
    plain(markup.slice(at, match.index));
    const surface = match[1];
    const readings = match[2].slice(1).split("|");
    const characters = [...surface];
    if (readings.length > 1 && readings.length === characters.length) {
      characters.forEach((character, index) =>
        segments.push({
          surface: character,
          reading: readings[index],
          isKanji: KANJI.test(character),
        })
      );
    } else {
      segments.push({
        surface,
        reading: readings.join(""),
        isKanji: KANJI.test(surface),
      });
    }
    at = match.index + match[0].length;
  }
  plain(markup.slice(at));
  return segments;
}

// Length a learner reads: characters, punctuation and spaces aside.
const readLength = (text: string) =>
  [...text.replace(/[\s、。，．！？!?「」『』（）()・…〜ー―\-.,"']/g, "")].length;

/**
 * The few shortest sentences worth showing for `word`: translated, not
 * repeated, longer than the word alone with a particle (食べる？ teaches
 * nothing), and no longer than a short line.
 */
export function pickShortSentences(
  sentences: JotobaSentence[],
  word: string,
  limit = 3,
  maxLength = 22
): JotobaSentence[] {
  const minLength = Math.max(4, readLength(word) + 2);
  const seen = new Set<string>();
  return sentences
    .filter((s) => {
      const length = readLength(s.content);
      if (!s.translation?.trim() || length < minLength || length > maxLength) {
        return false;
      }
      if (seen.has(s.content)) return false;
      seen.add(s.content);
      return true;
    })
    .map((s, index) => ({ s, index, length: readLength(s.content) }))
    // Shortest first; Jotoba's order among equals.
    .sort((a, b) => a.length - b.length || a.index - b.index)
    .slice(0, limit)
    .map(({ s }) => s);
}
