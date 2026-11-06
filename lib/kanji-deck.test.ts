// Tests for the kanji-in-word prompt hints. Run:  node --test lib/kanji-deck.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { hideStudiedReadings, wordRomajiOf } from "./kanji-deck.ts";

test("a kanji studied in another word loses its hint: 上着 with 上 on in 上手", () => {
  // 上着's own selection turned 上 off, so its stored runs hint 上.
  const parts = [
    { surface: "上", reading: "うわ" },
    { surface: "着", reading: null },
  ];
  assert.deepEqual(hideStudiedReadings(parts, new Set(["上", "着"])), [
    { surface: "上", reading: null },
    { surface: "着", reading: null },
  ]);
});

test("kanji you don't study anywhere keep their hint", () => {
  const parts = [
    { surface: "上", reading: null },
    { surface: "手", reading: "ず" },
  ];
  assert.deepEqual(hideStudiedReadings(parts, new Set(["上"])), parts);
});

test("a whole run loses its hint when any of its kanji is studied", () => {
  const parts = [{ surface: "今日", reading: "きょう" }];
  assert.deepEqual(hideStudiedReadings(parts, new Set(["日"])), [
    { surface: "今日", reading: null },
  ]);
});

test("the card back shows the romaji saved on the word, not one built from the reading", () => {
  const card = { word_reading: "びょう.き", reading: "びょう" };
  assert.equal(wordRomajiOf(card, { romaji: " byouki " }), "byouki");
});

test("without saved romaji, the word reading is converted with its dots dropped", () => {
  const card = { word_reading: "た.べる", reading: "た" };
  assert.equal(wordRomajiOf(card, { romaji: null }), "taberu");
  assert.equal(wordRomajiOf(card, { romaji: "  " }), "taberu");
  assert.equal(wordRomajiOf(card, null), "taberu");
});

test("a card without a word reading falls back to its kanji's reading", () => {
  assert.equal(wordRomajiOf({ word_reading: null, reading: "た" }, undefined), "ta");
});

test("no saved romaji and no reading shows nothing", () => {
  assert.equal(wordRomajiOf({ word_reading: null, reading: null }, null), "");
  assert.equal(wordRomajiOf({ word_reading: "", reading: " " }, { romaji: "" }), "");
});
