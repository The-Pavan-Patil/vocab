// Tests for the import update patch (lib/import-patch.ts). Run with:
//   node --test lib/import-patch.test.ts
//
// The contract: every column the import preview shows is carried when filled
// in (the sentence column was once dropped), and a blank or whitespace cell
// never overwrites what's already saved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nonEmptyPatch } from "./import-patch.ts";
import { COLUMNS } from "./types.ts";

test("carries every filled-in preview column, sentence included", () => {
  const patch = nonEmptyPatch({
    kanji: "食べる",
    romaji: "taberu",
    english: "to eat",
    tips: "खाणे",
    sentence: "ご飯を食べる。",
    category: "verb",
  });
  assert.deepEqual(patch, {
    kanji: "食べる",
    romaji: "taberu",
    english: "to eat",
    tips: "खाणे",
    sentence: "ご飯を食べる。",
    category: "verb",
  });
  for (const { key } of COLUMNS) assert.ok(key in patch, key);
});

test("blank, whitespace and missing cells are left out", () => {
  assert.deepEqual(
    nonEmptyPatch({
      kanji: "食べる",
      romaji: "  ",
      english: "",
      tips: null,
      sentence: undefined,
    }),
    { kanji: "食べる" }
  );
});

test("values are trimmed", () => {
  assert.deepEqual(nonEmptyPatch({ kanji: " 水 ", sentence: " 水を飲む。\n" }), {
    kanji: "水",
    sentence: "水を飲む。",
  });
});

test("non-column fields are never sent", () => {
  const patch = nonEmptyPatch({
    kanji: "水",
    study_as_kanji: true,
    kanji_selection: ["水"],
  });
  assert.deepEqual(patch, { kanji: "水" });
});
