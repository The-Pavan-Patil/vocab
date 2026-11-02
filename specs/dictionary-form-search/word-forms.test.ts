import { test } from "node:test";
import assert from "node:assert/strict";
import { wordFormCandidates, type JapaneseToken } from "./word-forms.ts";

function token(
  surface_form: string,
  basic_form: string,
  pos: string,
  pos_detail_1 = "*"
): JapaneseToken {
  return { surface_form, basic_form, pos, pos_detail_1 };
}

test("resolves polite and past verb forms", () => {
  assert.deepEqual(
    wordFormCandidates("食べました", [
      token("食べ", "食べる", "動詞", "自立"),
      token("まし", "ます", "助動詞"),
      token("た", "た", "助動詞"),
    ]),
    [{ word: "食べる", kind: "verb" }]
  );
  assert.deepEqual(
    wordFormCandidates("書いた", [
      token("書い", "書く", "動詞", "自立"),
      token("た", "た", "助動詞"),
    ]),
    [{ word: "書く", kind: "verb" }]
  );
});

test("resolves copula, plural, and suru noun forms", () => {
  assert.deepEqual(
    wordFormCandidates("猫でした", [
      token("猫", "猫", "名詞", "一般"),
      token("でし", "です", "助動詞"),
      token("た", "た", "助動詞"),
    ]),
    [{ word: "猫", kind: "noun" }]
  );
  assert.deepEqual(
    wordFormCandidates("猫たち", [
      token("猫", "猫", "名詞", "一般"),
      token("たち", "たち", "名詞", "接尾"),
    ]),
    [{ word: "猫", kind: "noun" }]
  );
  assert.deepEqual(
    wordFormCandidates("勉強した", [
      token("勉強", "勉強", "名詞", "サ変接続"),
      token("し", "する", "動詞", "自立"),
      token("た", "た", "助動詞"),
    ]),
    [
      { word: "勉強", kind: "noun" },
      { word: "勉強する", kind: "verb" },
    ]
  );
});

test("does not turn phrases or unrelated words into form matches", () => {
  assert.deepEqual(
    wordFormCandidates("猫を", [
      token("猫", "猫", "名詞", "一般"),
      token("を", "を", "助詞"),
    ]),
    []
  );
  assert.deepEqual(
    wordFormCandidates("日本語を勉強した", [
      token("日本語", "日本語", "名詞", "一般"),
      token("を", "を", "助詞"),
      token("勉強", "勉強", "名詞", "サ変接続"),
      token("し", "する", "動詞", "自立"),
      token("た", "た", "助動詞"),
    ]),
    []
  );
});
