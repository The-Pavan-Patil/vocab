import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conjugationTable,
  entryClass,
  nameForm,
  wordClass,
  type ConjugationTable,
} from "./conjugation.ts";

// label → "plain / polite" (or just plain), written forms.
function written(table: ConjugationTable) {
  return Object.fromEntries(
    [...table.basic, ...table.more].map((row) => [
      row.label,
      row.polite ? `${row.plain.text} / ${row.polite.text}` : row.plain.text,
    ])
  );
}

test("the class comes from Jisho's part-of-speech text", () => {
  assert.equal(wordClass(["Ichidan verb", "Transitive verb"]), "ichidan");
  assert.equal(wordClass(["Godan verb with 'ku' ending", "Intransitive verb"]), "godan");
  assert.equal(wordClass(["Godan verb - Iku/Yuku special class"]), "godan");
  assert.equal(wordClass(["Godan verb with 'ru' ending (irregular verb)"]), "godan");
  assert.equal(wordClass(["Godan verb with 'su' ending"]), "godan");
  assert.equal(wordClass(["Suru verb - included"]), "suru");
  assert.equal(wordClass(["Noun", "Suru verb"]), "suru");
  assert.equal(wordClass(["Kuru verb - special class"]), "kuru");
  assert.equal(wordClass(["I-adjective (keiyoushi) - yoi/ii class"]), "i-adj");
  assert.equal(wordClass(["Na-adjective (keiyodoshi)", "Noun"]), "na-adj");
  assert.equal(wordClass(["Noun"]), null);
  assert.equal(wordClass(["Ichidan verb - zuru verb (alternative form of -jiru verbs)"]), null);
  assert.equal(
    entryClass([{ partsOfSpeech: ["Noun"] }, { partsOfSpeech: ["Suru verb"] }]),
    "suru"
  );
});

test("an ichidan verb", () => {
  const t = written(conjugationTable("食べる", "たべる", "ichidan"));
  assert.equal(t["Present"], "食べる / 食べます");
  assert.equal(t["Negative"], "食べない / 食べません");
  assert.equal(t["Past"], "食べた / 食べました");
  assert.equal(t["Past negative"], "食べなかった / 食べませんでした");
  assert.equal(t["て-form"], "食べて");
  assert.equal(t["Want to"], "食べたい / 食べたいです");
  assert.equal(t["Can (potential)"], "食べられる / 食べられます");
  assert.equal(t["Let's (volitional)"], "食べよう / 食べましょう");
  assert.equal(t["Command"], "食べろ");
  assert.equal(t["Passive"], "食べられる");
  assert.equal(t["Causative"], "食べさせる");
  assert.equal(t["If (〜ば)"], "食べれば");
  assert.equal(t["If / when (〜たら)"], "食べたら");
});

test("godan verbs, 行く's irregular て and た included", () => {
  const kaku = written(conjugationTable("書く", "かく", "godan"));
  assert.equal(kaku["Past"], "書いた / 書きました");
  assert.equal(kaku["Can (potential)"], "書ける / 書けます");
  assert.equal(kaku["Let's (volitional)"], "書こう / 書きましょう");
  const iku = written(conjugationTable("行く", "いく", "godan"));
  assert.equal(iku["て-form"], "行って");
  assert.equal(iku["Past"], "行った / 行きました");
  const hanasu = written(conjugationTable("話す", "はなす", "godan"));
  assert.equal(hanasu["て-form"], "話して");
  assert.equal(hanasu["Negative"], "話さない / 話しません");
});

test("ある's negative is ない, and it has no potential or command", () => {
  const t = written(conjugationTable("ある", "ある", "godan"));
  assert.equal(t["Negative"], "ない / ありません");
  assert.equal(t["Past negative"], "なかった / ありませんでした");
  assert.equal(t["Can (potential)"], undefined);
  assert.equal(t["Command"], undefined);
});

test("する, a する noun and 来る", () => {
  const suru = written(conjugationTable("する", "する", "suru"));
  assert.equal(suru["Negative"], "しない / しません");
  assert.equal(suru["Can (potential)"], "できる / できます");
  const benkyou = conjugationTable("勉強", "べんきょう", "suru");
  assert.equal(written(benkyou)["Past"], "勉強した / 勉強しました");
  assert.equal(benkyou.basic[0].plain.romaji, "benkyousuru");
  const kuru = conjugationTable("来る", "くる", "kuru");
  const k = written(kuru);
  assert.equal(k["Negative"], "来ない / 来ません");
  assert.equal(k["Can (potential)"], "来られる / 来られます");
  assert.equal(k["Command"], "来い");
  // The romaji follows the reading: 来ない is konai, 来ます is kimasu.
  const negative = kuru.basic.find((row) => row.label === "Negative")!;
  assert.equal(negative.plain.romaji, "konai");
  assert.equal(negative.polite!.romaji, "kimasen");
});

test("i-adjectives, いい and compounds of it", () => {
  const takai = written(conjugationTable("高い", "たかい", "i-adj"));
  assert.equal(takai["Negative"], "高くない / 高くないです");
  assert.equal(takai["Past"], "高かった / 高かったです");
  assert.equal(takai["て-form"], "高くて");
  assert.equal(takai["Adverb"], "高く");
  const ii = written(conjugationTable("いい", "いい", "i-adj"));
  assert.equal(ii["Negative"], "よくない / よくないです");
  assert.equal(ii["Past"], "よかった / よかったです");
  const kakkoii = written(conjugationTable("かっこいい", "かっこいい", "i-adj"));
  assert.equal(kakkoii["Present"], "かっこいい / かっこいいです");
  assert.equal(kakkoii["Negative"], "かっこよくない / かっこよくないです");
});

test("na-adjectives", () => {
  const t = written(conjugationTable("静か", "しずか", "na-adj"));
  assert.equal(t["Present"], "静かだ / 静かです");
  assert.equal(t["Negative"], "静かじゃない / 静かではありません");
  assert.equal(t["Past"], "静かだった / 静かでした");
  assert.equal(t["Adverb"], "静かに");
  assert.equal(t["Before a noun"], "静かな");
});

test("a searched form is named from the table", () => {
  const iku = conjugationTable("行く", "いく", "godan");
  assert.equal(nameForm("行った", iku), "Past");
  assert.equal(nameForm("行きました", iku), "Past, polite");
  assert.equal(nameForm("行く", iku), null);
  const taberu = conjugationTable("食べる", "たべる", "ichidan");
  // A romaji query reaches here as kana.
  assert.equal(nameForm("たべた", taberu), "Past");
  assert.equal(nameForm("食べます", taberu), "Polite");
  assert.equal(nameForm("飲んだ", taberu), null);
  assert.equal(nameForm("よくない", conjugationTable("良い", "よい", "i-adj")), "Negative");
});
