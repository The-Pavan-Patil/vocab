import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectionForWord,
  validateKanjiSelection,
} from "./kanji-selection.ts";

test("accepts a unique subset of kanji present in the word", () => {
  assert.deepEqual(validateKanjiSelection("食事", ["食"]), {
    ok: true,
    selection: ["食"],
  });
  assert.deepEqual(validateKanjiSelection("食事", []), {
    ok: true,
    selection: [],
  });
});

test("null keeps the all-graded default", () => {
  assert.deepEqual(validateKanjiSelection("食事", null), {
    ok: true,
    selection: null,
  });
});

test("rejects unrelated, duplicate, multi-character, and non-array selections", () => {
  assert.equal(validateKanjiSelection("食事", ["日"]).ok, false);
  assert.equal(validateKanjiSelection("食事", ["食", "食"]).ok, false);
  assert.equal(validateKanjiSelection("食事", ["食事"]).ok, false);
  assert.equal(validateKanjiSelection("食事", ["hello"]).ok, false);
  assert.equal(validateKanjiSelection("食事", "食").ok, false);
});

test("a renamed word retains only selected characters that still exist", () => {
  assert.deepEqual(selectionForWord("食物", ["食", "事"]), ["食"]);
  assert.deepEqual(selectionForWord("食物", null), null);
});
