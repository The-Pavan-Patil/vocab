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
  readingStems,
  splitCompoundSegments,
  looseRomajiKey,
  kanaFromRomaji,
  alignReadingToWord,
  segmentsFromRomaji,
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

// ---------------------------------------------------------------------------
// splitCompoundSegments — kuroshiro keeps a compound as one run (上手=じょうず);
// these readings are kanjiapi.dev's on + kun lists, as the sync passes them.
// ---------------------------------------------------------------------------

const READINGS: Record<string, string[]> = {
  上: ["ジョウ", "ショウ", "シャン", "うえ", "-うえ", "うわ-", "かみ", "あ.げる"],
  手: ["シュ", "ズ", "て", "て-", "-て", "た-"],
  食: ["ショク", "ジキ", "く.う", "く.らう", "た.べる", "は.む"],
  事: ["ジ", "ズ", "こと", "つか.う", "つか.える"],
  学: ["ガク", "まな.ぶ"],
  校: ["コウ", "キョウ"],
  本: ["ホン", "もと"],
  棚: ["ホウ", "たな", "-だな"],
  一: ["イチ", "イツ", "ひと-", "ひと.つ"],
  杯: ["ハイ", "さかずき"],
  今: ["コン", "キン", "いま"],
  日: ["ニチ", "ジツ", "ひ", "-び", "-か"],
  大: ["ダイ", "タイ", "おお-", "おお.きい", "-おお.いに"],
  人: ["ジン", "ニン", "ひと", "-り", "-と"],
  下: ["カ", "ゲ", "した", "しも", "もと", "さ.げる", "くだ.る", "お.ろす"],
};
const readingsOf = (character: string) => READINGS[character] ?? [];

/** One unsplit kanji run, as kuroshiro returns a compound. */
const run = (surface: string, reading: string): FuriganaSegment[] => [
  { surface, reading, isKanji: true },
];
const split = (surface: string, reading: string) =>
  splitCompoundSegments(run(surface, reading), readingsOf).map(
    (s) => `${s.surface}=${s.reading}`
  );

test("readingStems: hiragana stems without okurigana or affix markers", () => {
  assert.deepEqual(readingStems(READINGS["上"]), [
    "じょう",
    "しょう",
    "しゃん",
    "うえ",
    "うわ",
    "かみ",
    "あ",
  ]);
});

test("splits a compound whose reading lines up with each kanji: 上手 → じょう + ず", () => {
  assert.deepEqual(split("上手", "じょうず"), ["上=じょう", "手=ず"]);
  assert.deepEqual(split("食事", "しょくじ"), ["食=しょく", "事=じ"]);
});

test("allows gemination before the last kanji: 学校 → がっ + こう, 一杯 → いっ + ぱい", () => {
  assert.deepEqual(split("学校", "がっこう"), ["学=がっ", "校=こう"]);
  assert.deepEqual(split("一杯", "いっぱい"), ["一=いっ", "杯=ぱい"]);
});

test("allows rendaku after the first kanji: 本棚 → ほん + だな", () => {
  assert.deepEqual(split("本棚", "ほんだな"), ["本=ほん", "棚=だな"]);
});

test("keeps jukujikun whole: 今日, 大人, 下手", () => {
  assert.deepEqual(split("今日", "きょう"), ["今日=きょう"]);
  assert.deepEqual(split("大人", "おとな"), ["大人=おとな"]);
  assert.deepEqual(split("下手", "へた"), ["下手=へた"]);
});

test("keeps a run whole when a kanji has no known readings", () => {
  assert.deepEqual(split("上龍", "じょうりゅう"), ["上龍=じょうりゅう"]);
});

test("keeps a run whole when the reading lines up more than one way", () => {
  const ambiguous = splitCompoundSegments(run("甲乙", "あいう"), (character) =>
    character === "甲" ? ["あ", "あい"] : ["いう", "う"]
  );
  assert.deepEqual(ambiguous, run("甲乙", "あいう"));
});

test("leaves single-kanji and kana segments untouched", () => {
  const segments = parseFuriganaHtml(TABERU);
  assert.deepEqual(splitCompoundSegments(segments, readingsOf), segments);
});

// --- The saved romaji as a check on the analyzer ---------------------------

const kanji = (surface: string, reading: string): FuriganaSegment => ({
  surface,
  reading,
  isKanji: true,
});
const kana = (surface: string): FuriganaSegment => ({
  surface,
  reading: surface,
  isKanji: false,
});

test("romaji spelled differently for the same sounds shares a key", () => {
  assert.equal(looseRomajiKey("Tōkyō"), looseRomajiKey("toukyou"));
  assert.equal(looseRomajiKey("tokyo"), looseRomajiKey("toukyou"));
  assert.equal(looseRomajiKey("kin'youbi"), looseRomajiKey("kinyoubi"));
  assert.equal(looseRomajiKey("sensē"), looseRomajiKey("sensei"));
  assert.notEqual(looseRomajiKey("ippon"), looseRomajiKey("ichihon"));
});

test("saved romaji converts to hiragana, or null when it isn't romaji", () => {
  assert.equal(kanaFromRomaji("sen'en"), "せんえん");
  assert.equal(kanaFromRomaji(" Tōkyō "), "とうきょう");
  assert.equal(kanaFromRomaji("TABERU"), "たべる");
  assert.equal(kanaFromRomaji("eat"), null);
  assert.equal(kanaFromRomaji("  "), null);
});

test("a reading lines up with the word's kana as written", () => {
  assert.deepEqual(alignReadingToWord("夜が明ける", "よがあける"), [
    kanji("夜", "よ"),
    kana("が"),
    kanji("明", "あ"),
    kana("ける"),
  ]);
  // Katakana keeps its script; the kanji after it takes the rest.
  assert.deepEqual(alignReadingToWord("トマト畑", "とまとばたけ"), [
    kana("トマト"),
    kanji("畑", "ばたけ"),
  ]);
  // Long vowels match by sound: コーヒー against こおひい.
  assert.deepEqual(alignReadingToWord("コーヒー豆", "こおひいまめ"), [
    kana("コーヒー"),
    kanji("豆", "まめ"),
  ]);
  // …and as wanakana reads ー after o (nōto → のうと) or as the doubled vowel.
  assert.deepEqual(alignReadingToWord("ノート", "のうと"), [kana("ノート")]);
  assert.deepEqual(alignReadingToWord("ノート", "のおと"), [kana("ノート")]);
  // Digits take a reading like kanji, though they aren't kanji.
  assert.deepEqual(alignReadingToWord("1か月", "いっかげつ"), [
    { surface: "1", reading: "いっ", isKanji: false },
    kana("か"),
    kanji("月", "げつ"),
  ]);
});

test("a reading that doesn't fit the word's kana lines up nowhere", () => {
  assert.equal(alignReadingToWord("食べる", "のむ"), null);
  assert.equal(alignReadingToWord("食べる", ""), null);
});

test("the analyzer's misreading is replaced by the saved romaji", () => {
  assert.deepEqual(
    segmentsFromRomaji("一本", "ippon", [kanji("一", "いち"), kanji("本", "ほん")]),
    [kanji("一本", "いっぽん")]
  );
  assert.deepEqual(segmentsFromRomaji("金", "kin", [kanji("金", "きむ")]), [
    kanji("金", "きん"),
  ]);
  assert.deepEqual(
    segmentsFromRomaji("9月", "kugatsu", [kana("9"), kanji("月", "つき")]),
    [kanji("9月", "くがつ")]
  );
});

test("the analyzer's reading stays when the romaji agrees or can't be used", () => {
  const taberu = [kanji("食", "た"), kana("べる")];
  assert.equal(segmentsFromRomaji("食べる", "taberu", taberu), null);
  assert.equal(segmentsFromRomaji("食べる", null, taberu), null);
  assert.equal(segmentsFromRomaji("食べる", "eat", taberu), null);
  assert.equal(segmentsFromRomaji("食べる", "nomu", taberu), null);
  // Casual romaji without long vowels doesn't overrule a right reading.
  assert.equal(
    segmentsFromRomaji("東京", "tokyo", [kanji("東京", "とうきょう")]),
    null
  );
  assert.equal(
    segmentsFromRomaji("金曜日", "kinyoubi", [kanji("金曜日", "きんようび")]),
    null
  );
});

