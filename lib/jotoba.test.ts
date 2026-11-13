import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseJotobaFurigana,
  pickShortSentences,
  type JotobaSentence,
} from "./jotoba.ts";

test("furigana markup becomes segments", () => {
  assert.deepEqual(parseJotobaFurigana("[高|たか]いな！"), [
    { surface: "高", reading: "たか", isKanji: true },
    { surface: "いな！", reading: "いな！", isKanji: false },
  ]);
  // One reading per kanji splits the group.
  assert.deepEqual(parseJotobaFurigana("[日本語|に|ほん|ご]を[話|はな]します。"), [
    { surface: "日", reading: "に", isKanji: true },
    { surface: "本", reading: "ほん", isKanji: true },
    { surface: "語", reading: "ご", isKanji: true },
    { surface: "を", reading: "を", isKanji: false },
    { surface: "話", reading: "はな", isKanji: true },
    { surface: "します。", reading: "します。", isKanji: false },
  ]);
  // One reading for the group keeps it whole (jukujikun).
  assert.deepEqual(parseJotobaFurigana("[今日|きょう]は"), [
    { surface: "今日", reading: "きょう", isKanji: true },
    { surface: "は", reading: "は", isKanji: false },
  ]);
  assert.deepEqual(parseJotobaFurigana("はい。"), [
    { surface: "はい。", reading: "はい。", isKanji: false },
  ]);
});

const s = (content: string, translation = "x"): JotobaSentence => ({
  content,
  furigana: content,
  translation,
});

test("the shortest useful sentences come first", () => {
  const picked = pickShortSentences(
    [
      s("食べる？"), // just the word: teaches nothing
      s("毎朝、私は駅の近くのパン屋でパンを買って食べるのが好きです。"), // too long
      s("パンを食べる。"),
      s("何を食べたい？"),
      s("パンを食べる。"), // repeated
      s("ご飯を食べた。", ""), // untranslated
      s("もう食べた。"),
      s("りんごを食べました。"),
    ],
    "食べる"
  );
  assert.deepEqual(
    picked.map((x) => x.content),
    ["もう食べた。", "パンを食べる。", "何を食べたい？"]
  );
});
