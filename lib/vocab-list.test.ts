import { test } from "node:test";
import assert from "node:assert/strict";
import type { Vocab } from "./types.ts";
import { mergeSavedWords, touchesKanjiCards, WordListLedger } from "./vocab-list.ts";

function word(id: string, overrides: Partial<Vocab> = {}): Vocab {
  return {
    id,
    kanji: id,
    created_at: "2026-11-01T00:00:00Z",
    study_as_kanji: false,
    ...overrides,
  } as Vocab;
}

test("a new word goes on top and an edited one stays where it was", () => {
  const list = [word("b"), word("a")];
  const merged = mergeSavedWords(list, [
    word("a", { english: "edited" }),
    word("c", { created_at: "2026-11-02T00:00:00Z" }),
  ]);

  assert.deepEqual(merged.map((w) => w.id), ["c", "b", "a"]);
  assert.equal(merged[2].english, "edited");
});

test("several new words are listed newest first", () => {
  const merged = mergeSavedWords(
    [word("old")],
    [
      word("n1", { created_at: "2026-11-02T00:00:00Z" }),
      word("n2", { created_at: "2026-11-03T00:00:00Z" }),
    ]
  );
  assert.deepEqual(merged.map((w) => w.id), ["n2", "n1", "old"]);
});

test("nothing saved leaves the list untouched", () => {
  const list = [word("a")];
  assert.equal(mergeSavedWords(list, []), list);
});

test("only words that study their kanji, now or before, touch the kanji cards", () => {
  const list = [word("plain"), word("was-kanji", { study_as_kanji: true })];

  assert.equal(touchesKanjiCards(list, [word("plain", { english: "x" })]), false);
  assert.equal(touchesKanjiCards(list, [word("new")]), false);
  assert.equal(touchesKanjiCards(list, [word("new", { study_as_kanji: true })]), true);
  // Turned off: its cards were just deactivated.
  assert.equal(touchesKanjiCards(list, [word("was-kanji", { study_as_kanji: false })]), true);
});

test("a word the loaded kanji cards come from touches them even if it's off here", () => {
  const list = [word("stale")];
  const hasCards = (id: string) => id === "stale";
  assert.equal(touchesKanjiCards(list, [word("stale", { english: "x" })], hasCards), true);
  assert.equal(touchesKanjiCards(list, [word("other")], hasCards), false);
});

test("a repeated id keeps its last saved copy", () => {
  const merged = mergeSavedWords(
    [word("a")],
    [word("a", { english: "first" }), word("a", { english: "second" })]
  );
  assert.deepEqual(merged.map((w) => w.english), ["second"]);
});

test("a batch sharing one created_at merges in the server's order (by id)", () => {
  const at = "2026-11-03T00:00:00Z";
  const merged = mergeSavedWords(
    [word("old")],
    [word("c", { created_at: at }), word("a", { created_at: at }), word("b", { created_at: at })]
  );
  assert.deepEqual(merged.map((w) => w.id), ["a", "b", "c", "old"]);
});

test("a fetch read before a save gets the save replayed on top", () => {
  const ledger = new WordListLedger();
  const ticket = ledger.start();
  const added = word("new", { created_at: "2026-11-05T00:00:00Z" });
  ledger.record((list) => mergeSavedWords(list, [added]));
  ledger.record((list) => list.filter((w) => w.id !== "gone"));
  const shown = ledger.land(ticket, [word("kept"), word("gone")]);
  assert.deepEqual(shown?.map((w) => w.id), ["new", "kept"]);
  assert.equal(ledger.hasLanded, true);
});

test("a fetch that started before one already shown is ignored", () => {
  const ledger = new WordListLedger();
  const older = ledger.start();
  const newer = ledger.start();
  assert.ok(ledger.land(newer, [word("fresh")]));
  assert.equal(ledger.land(older, [word("stale")]), null);
});

test("changes made before a fetch started aren't replayed twice", () => {
  const ledger = new WordListLedger();
  let replays = 0;
  ledger.record((list) => {
    replays++;
    return list;
  });
  const ticket = ledger.start();
  ledger.land(ticket, []);
  assert.equal(replays, 0);
});
