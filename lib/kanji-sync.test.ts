import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KanjiInfo, Vocab } from "./types.ts";
import {
  buildDesiredKanjiCards,
  planKanjiReconciliation,
  type DesiredKanjiCard,
} from "./kanji-sync.ts";

const db = null as unknown as SupabaseClient;

function vocab(overrides: Partial<Vocab>): Vocab {
  return {
    id: "v1",
    kanji: "食事",
    english: "meal",
    study_as_kanji: true,
    kanji_selection: ["食"],
    ...overrides,
  } as Vocab;
}

function info(character: string, jlpt: number | null): KanjiInfo {
  return {
    character,
    jlpt,
    meanings: [],
    on: [],
    kun: [],
    grade: null,
    strokeCount: null,
    heisig: null,
    words: [],
  };
}

test("explicit selections create only selected cards, including ungraded kanji", async () => {
  const rows = await buildDesiredKanjiCards(db, "u1", [vocab({})], {
    getKanji: async (_supabase, character) => info(character, null),
    segment: async () => [
      { surface: "食", reading: "しょく", isKanji: true },
      { surface: "事", reading: "じ", isKanji: true },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].character, "食");
  assert.equal(rows[0].reading, "しょく");
  assert.equal(rows[0].active, true);
});

test("uncurated words include graded kanji and skip ungraded kanji", async () => {
  const rows = await buildDesiredKanjiCards(
    db,
    "u1",
    [vocab({ kanji_selection: null })],
    {
      getKanji: async (_supabase, character) =>
        info(character, character === "食" ? 5 : null),
      segment: async () => [],
    }
  );
  assert.deepEqual(rows.map((row) => row.character), ["食"]);
});

test("a transient segmentation failure leaves reading fields untouched", async () => {
  const rows = await buildDesiredKanjiCards(db, "u1", [vocab({})], {
    getKanji: async (_supabase, character) => info(character, 5),
    segment: async () => {
      throw new Error("temporary analyzer failure");
    },
  });

  assert.equal(rows.length, 1);
  assert.equal("reading" in rows[0], false);
  assert.equal("word_reading" in rows[0], false);
});

test("reconciliation updates, activates, creates, and deactivates without deleting", () => {
  const desired = [
    { vocab_id: "v1", character: "食" },
    { vocab_id: "v2", character: "日" },
    { vocab_id: "v3", character: "本" },
  ].map(
    (row): DesiredKanjiCard => ({
      ...row,
      user_id: "u1",
      active: true,
      jlpt: 5,
      word: row.character,
      word_meaning: null,
    })
  );
  const plan = planKanjiReconciliation(
    [
      { id: "keep", vocab_id: "v1", character: "食", active: true },
      { id: "reactivate", vocab_id: "v2", character: "日", active: false },
      { id: "turn-off", vocab_id: "v1", character: "事", active: true },
    ],
    desired
  );

  assert.deepEqual(plan, {
    created: 1,
    updated: 1,
    activated: 1,
    deactivated: 1,
    deactivateIds: ["turn-off"],
  });
});
