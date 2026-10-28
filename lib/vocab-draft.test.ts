// Tests for the edit-dialog dirty check (lib/vocab-draft.ts). Run with:
//   node --test lib/vocab-draft.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { isDraftDirty } from "./vocab-draft.ts";
import type { VocabInput } from "./types.ts";

const start: VocabInput = {
  kanji: "食べる",
  romaji: "taberu",
  english: "to eat",
  tips: null,
  sentence: "",
  category: "verb",
  study_as_kanji: false,
};

test("an untouched draft is clean, even with null vs empty string", () => {
  assert.equal(isDraftDirty(start, { ...start }), false);
  assert.equal(isDraftDirty(start, { ...start, tips: "", sentence: null }), false);
  assert.equal(isDraftDirty(start, { ...start, english: " to eat " }), false);
});

test("any typed field makes it dirty", () => {
  for (const [key, value] of [
    ["kanji", "飲む"],
    ["romaji", "nomu"],
    ["english", "to drink"],
    ["tips", "पिणे"],
    ["sentence", "水を飲む。"],
    ["category", "noun"],
  ] as const) {
    assert.equal(isDraftDirty(start, { ...start, [key]: value }), true, key);
  }
});

test("toggling study-as-kanji makes it dirty", () => {
  assert.equal(isDraftDirty(start, { ...start, study_as_kanji: true }), true);
});

test("the kanji selection alone does not", () => {
  assert.equal(
    isDraftDirty(start, { ...start, kanji_selection: ["食"] }),
    false
  );
});
