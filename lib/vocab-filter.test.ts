// Tests for the List tab's search and filters. Run:  node --test lib/vocab-filter.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Vocab } from "./types.ts";
import { filterVocab, studiedKanjiOf } from "./vocab-filter.ts";

function word(overrides: Partial<Vocab>): Vocab {
  return {
    id: overrides.kanji ?? "w",
    kanji: "",
    romaji: null,
    english: null,
    tips: null,
    sentence: null,
    category: null,
    study_as_kanji: false,
    kanji_selection: null,
    ...overrides,
  } as Vocab;
}

const JOUZU = word({ kanji: "上手", english: "skilful", study_as_kanji: true, kanji_selection: ["上"] });
const UWAGI = word({ kanji: "上着", english: "jacket", study_as_kanji: true, kanji_selection: ["着"] });
const UE = word({ kanji: "上", english: "above", study_as_kanji: false, sentence: "机の上" });
const TSUKUE = word({ kanji: "机", english: "desk", sentence: "机の上に本がある" });
const ALL = [JOUZU, UWAGI, UE, TSUKUE];

const ids = (words: Vocab[]) => words.map((w) => w.kanji);
const search = (query: string, extra: Partial<Parameters<typeof filterVocab>[1]> = {}) =>
  ids(
    filterVocab(ALL, {
      query,
      field: "all",
      category: "all",
      kanjiStudy: "all",
      ...extra,
    })
  );

test("studiedKanjiOf: the turned-on kanji, none when not in the Kanji deck", () => {
  assert.deepEqual(studiedKanjiOf(JOUZU), ["上"]);
  assert.deepEqual(studiedKanjiOf(UE), []);
  // Saved before per-kanji selection: every kanji counts.
  assert.deepEqual(
    studiedKanjiOf(word({ kanji: "上手", study_as_kanji: true, kanji_selection: null })),
    ["上", "手"]
  );
});

test("search looks in every field by default, or just the chosen one", () => {
  assert.deepEqual(search("上"), ["上手", "上着", "上", "机"]);
  assert.deepEqual(search("上", { field: "kanji" }), ["上手", "上着", "上"]);
  assert.deepEqual(search("jacket", { field: "kanji" }), []);
  assert.deepEqual(search("jacket", { field: "english" }), ["上着"]);
});

test("a searched kanji + Studied as Kanji lists the words where it's turned on", () => {
  assert.deepEqual(search("上", { field: "kanji", kanjiStudy: "on" }), ["上手"]);
  assert.deepEqual(search("上", { field: "kanji", kanjiStudy: "off" }), ["上着", "上"]);
});

test("without kanji in the search, the filter is Kanji-deck membership", () => {
  assert.deepEqual(search("", { kanjiStudy: "on" }), ["上手", "上着"]);
  assert.deepEqual(search("", { kanjiStudy: "off" }), ["上", "机"]);
});

test("category still filters", () => {
  const noun = word({ kanji: "本", category: "noun" });
  assert.deepEqual(
    ids(filterVocab([...ALL, noun], { query: "", field: "all", category: "noun", kanjiStudy: "all" })),
    ["本"]
  );
});
