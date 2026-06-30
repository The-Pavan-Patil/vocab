// Tests for the kanjiapi.dev normalizer. Run:  node --test lib/kanjiapi.test.ts
//
// `normalizeKanji` is pure (no network/DB), so we feed it sample /v1/kanji and
// /v1/words payloads shaped exactly like the real API responses.

import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeKanji } from "./kanjiapi.ts";

// Real /v1/kanji/食 response shape.
const RAW_KANJI = {
  kanji: "食",
  grade: 2,
  jlpt: 5,
  stroke_count: 9,
  heisig_en: "eat",
  meanings: ["eat", "food"],
  kun_readings: ["く.う", "た.べる"],
  on_readings: ["ショク", "ジキ"],
};

// Real /v1/words/食 response shape (truncated).
const RAW_WORDS = [
  {
    variants: [{ written: "朝食", pronounced: "ちょうしょく", priorities: [] }],
    meanings: [{ glosses: ["breakfast"] }],
  },
  {
    variants: [{ written: "食事", pronounced: "しょくじ" }],
    meanings: [{ glosses: ["meal", "dinner"] }],
  },
  { variants: [], meanings: [{ glosses: ["ignored — no written form"] }] },
];

test("normalizes a kanji payload into KanjiInfo", () => {
  const info = normalizeKanji(RAW_KANJI, [], "食");
  assert.equal(info.character, "食");
  assert.equal(info.jlpt, 5);
  assert.equal(info.grade, 2);
  assert.equal(info.strokeCount, 9);
  assert.equal(info.heisig, "eat");
  assert.deepEqual(info.meanings, ["eat", "food"]);
  assert.deepEqual(info.on, ["ショク", "ジキ"]);
  assert.deepEqual(info.kun, ["く.う", "た.べる"]);
  assert.deepEqual(info.words, []);
});

test("maps example words (first variant + flattened glosses), dropping empties", () => {
  const info = normalizeKanji(RAW_KANJI, RAW_WORDS, "食");
  assert.deepEqual(info.words, [
    { written: "朝食", pronounced: "ちょうしょく", glosses: ["breakfast"] },
    { written: "食事", pronounced: "しょくじ", glosses: ["meal", "dinner"] },
  ]);
});

test("tolerates missing fields with safe defaults", () => {
  const info = normalizeKanji({ kanji: "々" }, [], "々");
  assert.equal(info.jlpt, null);
  assert.equal(info.grade, null);
  assert.equal(info.strokeCount, null);
  assert.equal(info.heisig, null);
  assert.deepEqual(info.meanings, []);
  assert.deepEqual(info.on, []);
  assert.deepEqual(info.kun, []);
});
