// Tests for the romaji layer in front of the Jisho search (lib/romaji-search.ts).
// Run with:  node --test lib/romaji-search.test.ts
//
// Jisho only converts all-lowercase romaji and reads doubled vowels as two
// kana, so these pin down which extra queries a romaji search runs (and that
// Japanese / English searches stay a single call), and how the results merge.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeResults, normalizeRomaji, romajiSearch } from "./romaji-search.ts";
import type { DictEntry } from "./types.ts";

const keys = (q: string) => romajiSearch(q)?.keys ?? null;

test("Japanese, English and multi-word queries are searched as typed", () => {
  for (const q of ["食べる", "たべる", "コーヒー", "taberu食", "eat", "Water", "konnichi wa", "-", "'"]) {
    assert.equal(romajiSearch(q), null, q);
  }
});

test("plain lowercase romaji keeps its single Jisho call", () => {
  assert.deepEqual(keys("taberu"), ["taberu"]);
  assert.deepEqual(keys("sensei"), ["sensei"]);
  assert.deepEqual(keys("ko-hi-"), ["ko-hi-"]);
  assert.deepEqual(keys("kin'en"), ["kin'en"]);
});

test("capitalised romaji also searches the lowercase form", () => {
  assert.deepEqual(keys("Taberu"), ["Taberu", "taberu"]);
  // A capital can matter for English ("Tokyo" → 東京), so the query as typed
  // stays first.
  assert.deepEqual(keys("Tokyo"), ["Tokyo", "tokyo"]);
});

test("a doubled vowel also searches the katakana long-vowel form", () => {
  assert.deepEqual(keys("koohii"), ["koohii", "コーヒー"]);
  assert.deepEqual(keys("juusu"), ["juusu", "ジュース"]);
  assert.deepEqual(keys("Biiru"), ["Biiru", "biiru", "ビール"]);
});

test("macrons and curly apostrophes are normalised", () => {
  assert.deepEqual(keys("kyō"), ["kyō", "kyou"]);
  assert.deepEqual(keys("Gakkō"), ["Gakkō", "gakkou"]);
  assert.equal(normalizeRomaji("kin’en"), "kin'en");
  assert.equal(romajiSearch("kin’en")?.romaji, "kin'en");
  // Combining macron (o + U+0304) composes before mapping.
  assert.equal(normalizeRomaji("kyō"), "kyou");
});

const entry = (slug: string, romaji: string): DictEntry => ({
  slug,
  word: slug,
  reading: "",
  romaji,
  isCommon: false,
  jlpt: [],
  senses: [],
});
const slugs = (list: DictEntry[]) => list.map((e) => e.slug);

test("entries whose romaji is what was typed go first", () => {
  const typed = [entry("住す", "juusu"), entry("重水素", "juusuiso")];
  const katakana = [entry("ジュース", "juusu"), entry("デュース", "dyuusu")];
  assert.deepEqual(slugs(mergeResults([typed, katakana], "juusu")), [
    "住す",
    "ジュース",
    "重水素",
    "デュース",
  ]);
});

test("duplicates are dropped and the as-typed results lead", () => {
  const typed = [entry("先生", "sensei"), entry("proverb", "senseito")];
  const lower = [entry("先生", "sensei"), entry("宣誓", "sensei"), entry("other", "x")];
  assert.deepEqual(slugs(mergeResults([typed, lower], "sensei")), [
    "先生",
    "宣誓",
    "proverb",
    "other",
  ]);
});

test("no exact romaji keeps Jisho's order (Tokyo stays 東京 first)", () => {
  const typed = [entry("東京", "toukyou"), entry("上京", "joukyou")];
  const lower = [entry("斗きょう", "tokyou")];
  assert.deepEqual(slugs(mergeResults([typed, lower], "tokyo")), [
    "東京",
    "上京",
    "斗きょう",
  ]);
  // A non-romaji search passes straight through.
  assert.deepEqual(slugs(mergeResults([typed])), ["東京", "上京"]);
});

test("the merged list is capped at one page", () => {
  const page = (p: string) =>
    Array.from({ length: 20 }, (_, i) => entry(`${p}${i}`, `${p}${i}`));
  const merged = mergeResults([page("a"), page("b")], "b5");
  assert.equal(merged.length, 20);
  assert.equal(merged[0].slug, "b5");
  assert.equal(merged[1].slug, "a0");
});
