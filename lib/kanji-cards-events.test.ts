import { test } from "node:test";
import assert from "node:assert/strict";
import {
  announceKanjiCardsChanged,
  hasKanjiCards,
  kanjiCardsVersion,
  noteKanjiCardWords,
  subscribeKanjiCardsChanged,
} from "./kanji-cards-events.ts";

test("an announcement moves the version and reaches subscribers until they leave", () => {
  let heard = 0;
  const unsubscribe = subscribeKanjiCardsChanged(() => heard++);
  const before = kanjiCardsVersion();
  announceKanjiCardsChanged();
  assert.equal(kanjiCardsVersion(), before + 1);
  assert.equal(heard, 1);
  unsubscribe();
  announceKanjiCardsChanged();
  assert.equal(heard, 1);
  assert.equal(kanjiCardsVersion(), before + 2);
});

test("the noted card words replace the previous set", () => {
  noteKanjiCardWords(["v1", "v2"]);
  assert.equal(hasKanjiCards("v1"), true);
  noteKanjiCardWords(["v3"]);
  assert.equal(hasKanjiCards("v1"), false);
  assert.equal(hasKanjiCards("v3"), true);
});
