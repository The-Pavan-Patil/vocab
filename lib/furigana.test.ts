// Tests for the furigana parser + segment helpers. Run:  node --test lib/furigana.test.ts
//
// Only the PURE pieces are tested — parsing kuroshiro's ruby HTML and deriving
// per-kanji readings. `segment()` itself needs the heavy kuromoji analyzer, so it
// is exercised by the manual verification steps, not here.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseFuriganaHtml,
  fullReading,
  dottedReading,
  singleKanjiReadings,
  type FuriganaSegment,
} from "./furigana.ts";

// 行く: ruby over 行 only, く is okurigana.
const IKU = "<ruby>行<rp>(</rp><rt>い</rt><rp>)</rp></ruby>く";

// kuroshiro furigana output for 食べる: ruby over 食 only, okurigana left plain.
const TABERU = "<ruby>食<rp>(</rp><rt>た</rt><rp>)</rp></ruby>べる";
// 食事: per-kanji ruby (each kanji its own reading).
const SHOKUJI =
  "<ruby>食<rp>(</rp><rt>しょく</rt><rp>)</rp>事<rp>(</rp><rt>じ</rt><rp>)</rp></ruby>";
// 今日 (jukujikun): one ruby over the whole run — can't split per character.
const KYOU = "<ruby>今日<rp>(</rp><rt>きょう</rt><rp>)</rp></ruby>";

test("parses okurigana: 食べる → 食=た + べる(kana)", () => {
  assert.deepEqual(parseFuriganaHtml(TABERU), [
    { surface: "食", reading: "た", isKanji: true },
    { surface: "べる", reading: "べる", isKanji: false },
  ]);
});

test("parses a per-kanji compound: 食事 → 食=しょく, 事=じ", () => {
  assert.deepEqual(parseFuriganaHtml(SHOKUJI), [
    { surface: "食", reading: "しょく", isKanji: true },
    { surface: "事", reading: "じ", isKanji: true },
  ]);
});

test("keeps an irregular compound as one unsplit run: 今日 → きょう", () => {
  assert.deepEqual(parseFuriganaHtml(KYOU), [
    { surface: "今日", reading: "きょう", isKanji: true },
  ]);
});

test("fullReading reconstructs the whole word reading", () => {
  assert.equal(fullReading(parseFuriganaHtml(TABERU)), "たべる");
  assert.equal(fullReading(parseFuriganaHtml(SHOKUJI)), "しょくじ");
});

test("dottedReading separates kanji readings with a dot: 行く → い.く", () => {
  assert.equal(dottedReading(parseFuriganaHtml(IKU)), "い.く");
  assert.equal(dottedReading(parseFuriganaHtml(TABERU)), "た.べる");
  assert.equal(dottedReading(parseFuriganaHtml(SHOKUJI)), "しょく.じ");
  // A single unsplit run has no boundary → no dot.
  assert.equal(dottedReading(parseFuriganaHtml(KYOU)), "きょう");
});

test("singleKanjiReadings maps only kanji that sit ALONE in their segment", () => {
  assert.deepEqual(
    [...singleKanjiReadings(parseFuriganaHtml(TABERU))],
    [["食", "た"]]
  );
  assert.deepEqual(
    [...singleKanjiReadings(parseFuriganaHtml(SHOKUJI))],
    [["食", "しょく"], ["事", "じ"]]
  );
  // 今日 is a multi-kanji run → no per-character reading is claimed.
  assert.deepEqual([...singleKanjiReadings(parseFuriganaHtml(KYOU))], []);
});

test("plain kana with no ruby comes back as a single kana segment", () => {
  const segs: FuriganaSegment[] = parseFuriganaHtml("たべる");
  assert.deepEqual(segs, [{ surface: "たべる", reading: "たべる", isKanji: false }]);
});
