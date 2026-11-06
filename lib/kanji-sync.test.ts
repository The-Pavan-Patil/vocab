import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { KanjiInfo, Vocab } from "./types.ts";
import {
  buildDesiredKanjiCards,
  buildWordPromptParts,
  planKanjiReconciliation,
  syncKanjiCards,
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
  assert.deepEqual(rows[0].word_prompt_parts, [
    { surface: "食", reading: null },
    { surface: "事", reading: "じ" },
  ]);
  assert.equal(rows[0].active, true);
});

test("selected kanji remain unhinted on every card", () => {
  const parts = buildWordPromptParts(
    [
      { surface: "食", reading: "しょく", isKanji: true },
      { surface: "事", reading: "じ", isKanji: true },
    ],
    ["食", "事"]
  );

  assert.deepEqual(parts, [
    { surface: "食", reading: null },
    { surface: "事", reading: null },
  ]);
});

test("fully unselected compound segments keep their safe group reading", () => {
  const parts = buildWordPromptParts(
    [
      { surface: "今日", reading: "きょう", isKanji: true },
      { surface: "食", reading: "しょく", isKanji: true },
    ],
    ["食"]
  );

  assert.deepEqual(parts, [
    { surface: "今日", reading: "きょう" },
    { surface: "食", reading: null },
  ]);
});

test("mixed ambiguous segments never invent a partial reading", () => {
  const parts = buildWordPromptParts(
    [{ surface: "今日", reading: "きょう", isKanji: true }],
    ["今"]
  );

  assert.deepEqual(parts, [{ surface: "今日", reading: null }]);
});

test("uncurated words include graded kanji and skip ungraded kanji", async () => {
  const rows = await buildDesiredKanjiCards(
    db,
    "u1",
    [vocab({ kanji_selection: null })],
    {
      getKanji: async (_supabase, character) =>
        info(character, character === "食" ? 5 : null),
      segment: async () => [
        { surface: "食", reading: "しょく", isKanji: true },
        { surface: "事", reading: "じ", isKanji: true },
      ],
    }
  );
  assert.deepEqual(rows.map((row) => row.character), ["食"]);
  assert.deepEqual(rows[0].word_prompt_parts, [
    { surface: "食", reading: null },
    { surface: "事", reading: "じ" },
  ]);
});

test("a compound run is split per kanji so a turned-off kanji gets its own hint", async () => {
  const readings: Record<string, string[]> = {
    上: ["ジョウ", "ショウ", "うえ", "あ.げる"],
    手: ["シュ", "ズ", "て", "-て"],
  };
  const rows = await buildDesiredKanjiCards(
    db,
    "u1",
    [vocab({ kanji: "上手", english: "skilful", kanji_selection: ["上"] })],
    {
      getKanji: async (_supabase, character) => ({
        ...info(character, character === "上" ? 5 : 4),
        on: readings[character].filter((r) => /^[ァ-ヶ]/.test(r)),
        kun: readings[character].filter((r) => !/^[ァ-ヶ]/.test(r)),
      }),
      // kuroshiro keeps the compound as one run.
      segment: async () => [{ surface: "上手", reading: "じょうず", isKanji: true }],
    }
  );

  assert.deepEqual(rows.map((row) => row.character), ["上"]);
  assert.equal(rows[0].reading, "じょう");
  assert.equal(rows[0].word_reading, "じょう.ず");
  assert.deepEqual(rows[0].word_prompt_parts, [
    { surface: "上", reading: null },
    { surface: "手", reading: "ず" },
  ]);
});

test("the word's saved romaji corrects the analyzer's reading before it's split", async () => {
  const readings: Record<string, string[]> = {
    一: ["イチ", "イツ", "ひと"],
    本: ["ホン", "もと"],
  };
  const rows = await buildDesiredKanjiCards(
    db,
    "u1",
    [vocab({ kanji: "一本", romaji: "ippon", kanji_selection: ["本"] })],
    {
      getKanji: async (_supabase, character) => ({
        ...info(character, 5),
        on: readings[character].filter((r) => /^[ァ-ヶ]/.test(r)),
        kun: readings[character].filter((r) => !/^[ァ-ヶ]/.test(r)),
      }),
      // kuromoji reads the number and the counter apart: いち + ほん.
      segment: async () => [
        { surface: "一", reading: "いち", isKanji: true },
        { surface: "本", reading: "ほん", isKanji: true },
      ],
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].word_reading, "いっ.ぽん");
  assert.equal(rows[0].reading, "ぽん");
  assert.deepEqual(rows[0].word_prompt_parts, [
    { surface: "一", reading: "いっ" },
    { surface: "本", reading: null },
  ]);
});

test("a failed lookup of a turned-off kanji leaves its run whole without failing the sync", async () => {
  const rows = await buildDesiredKanjiCards(
    db,
    "u1",
    [vocab({ kanji: "上手", kanji_selection: ["上"] })],
    {
      getKanji: async (_supabase, character) => {
        if (character === "手") throw new Error("kanjiapi unreachable");
        return { ...info(character, 5), on: ["ジョウ"] };
      },
      segment: async () => [{ surface: "上手", reading: "じょうず", isKanji: true }],
    }
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].reading, null);
  assert.equal(rows[0].word_reading, "じょうず");
  assert.deepEqual(rows[0].word_prompt_parts, [{ surface: "上手", reading: null }]);
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
  assert.equal("word_prompt_parts" in rows[0], false);
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
      word_sentence: null,
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

test("the kanji cache is read once for every word, and only misses are looked up", async () => {
  const cacheReads: string[][] = [];
  const lookups: string[] = [];
  const rows = await buildDesiredKanjiCards(
    db,
    "u1",
    [
      vocab({ id: "v1", kanji: "食事", kanji_selection: null }),
      vocab({ id: "v2", kanji: "食堂", kanji_selection: null }),
      vocab({ id: "v3", kanji: "大事", study_as_kanji: false }),
    ],
    {
      getCachedKanji: async (_supabase, characters) => {
        cacheReads.push(characters);
        return { 食: info("食", 5), 事: info("事", 4) };
      },
      getKanji: async (_supabase, character) => {
        lookups.push(character);
        return info(character, 3);
      },
      segment: async (word) =>
        [...word].map((surface) => ({ surface, reading: "x", isKanji: true })),
    }
  );

  // Toggled words only, each character once.
  assert.deepEqual(cacheReads, [["食", "事", "堂"]]);
  assert.deepEqual(lookups, ["堂"]);
  assert.deepEqual(
    rows.map((row) => `${row.vocab_id}:${row.character}:${row.jlpt}`),
    ["v1:食:5", "v1:事:4", "v2:食:5", "v2:堂:3"]
  );
});

test("a failed cache read falls back to looking up each kanji", async () => {
  const lookups: string[] = [];
  const rows = await buildDesiredKanjiCards(db, "u1", [vocab({})], {
    getCachedKanji: async () => {
      throw new Error("cache unavailable");
    },
    getKanji: async (_supabase, character) => {
      lookups.push(character);
      return info(character, 5);
    },
    segment: async () => [],
  });

  assert.deepEqual(lookups.sort(), ["事", "食"]);
  assert.deepEqual(rows.map((row) => row.character), ["食"]);
});

test("a failed lookup of a selected kanji still fails the sync", async () => {
  await assert.rejects(
    buildDesiredKanjiCards(db, "u1", [vocab({})], {
      getCachedKanji: async () => ({}),
      getKanji: async (_supabase, character) => {
        if (character === "食") throw new Error("kanjiapi unreachable");
        return info(character, 5);
      },
      segment: async () => [],
    }),
    /kanjiapi unreachable/
  );
});

// A stand-in for the few PostgREST calls syncKanjiCards makes. Every builder
// is a thenable that records its call and resolves { data, error }.
type Call = { op: string; rows?: unknown[]; ids?: string[] };
type Failure = { message: string } | null;

function fakeSupabase(
  existing: { id: string; vocab_id: string; character: string; active: boolean }[],
  failures: Partial<Record<"select" | "upsert" | "update", string>> = {}
) {
  const calls: Call[] = [];
  const builder = (op: "select" | "upsert" | "update", data: unknown) => {
    const call: Call = { op };
    const error: Failure = failures[op] ? { message: failures[op] } : null;
    const chain = {
      eq: () => chain,
      order: () => chain,
      range: () => chain,
      in: (_column: string, values: string[]) => {
        call.ids = values;
        return chain;
      },
      then: (resolve: (value: unknown) => void) => {
        calls.push(call);
        resolve({ data: error ? null : data, error, count: existing.length });
      },
    };
    return { call, chain };
  };
  const client = {
    from: () => ({
      select: () => builder("select", existing).chain,
      upsert: (rows: unknown[]) => {
        const { call, chain } = builder("upsert", null);
        call.rows = rows;
        return chain;
      },
      update: () => builder("update", null).chain,
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const syncDependencies = {
  getKanji: async (_supabase: SupabaseClient, character: string) => info(character, 5),
  segment: async () => [{ surface: "食事", reading: "しょくじ", isKanji: true }],
};

test("a full sync deactivates unselected cards in batches alongside the upsert", async () => {
  const existing = Array.from({ length: 150 }, (_, index) => ({
    id: `old-${index}`,
    vocab_id: `gone-${index}`,
    character: "日",
    active: true,
  }));
  const { client, calls } = fakeSupabase(existing);
  const stats = await syncKanjiCards(client, "u1", [vocab({})], {
    full: true,
    dependencies: syncDependencies,
  });

  assert.deepEqual(stats, { created: 1, updated: 0, activated: 0, deactivated: 150 });
  const updates = calls.filter((call) => call.op === "update");
  assert.deepEqual(updates.map((call) => call.ids?.length), [100, 50]);
  assert.equal(calls.filter((call) => call.op === "upsert").length, 1);
});

test("a failed write fails the sync once every write has been sent", async () => {
  const existing = [{ id: "old", vocab_id: "gone", character: "日", active: true }];
  const { client, calls } = fakeSupabase(existing, { upsert: "upsert rejected" });
  await assert.rejects(
    syncKanjiCards(client, "u1", [vocab({})], { full: true, dependencies: syncDependencies }),
    /upsert rejected/
  );
  // The deactivation still went out alongside the failed upsert.
  assert.deepEqual(calls.map((call) => call.op).sort(), ["select", "update", "upsert"]);
});

test("a failed read of the current cards fails the sync before any write", async () => {
  const { client, calls } = fakeSupabase([], { select: "read rejected" });
  await assert.rejects(
    syncKanjiCards(client, "u1", [vocab({})], { dependencies: syncDependencies }),
    /read rejected/
  );
  assert.deepEqual(calls.map((call) => call.op), ["select"]);
});

test("a per-word sync reads the current cards 100 words at a time", async () => {
  const { client, calls } = fakeSupabase([]);
  const words = Array.from({ length: 150 }, (_, index) =>
    vocab({ id: `v${index}`, study_as_kanji: false })
  );
  await syncKanjiCards(client, "u1", words, { dependencies: syncDependencies });
  const reads = calls.filter((call) => call.op === "select");
  assert.deepEqual(reads.map((call) => call.ids?.length), [100, 50]);
});

test("a word with every kanji turned off makes no cards and looks nothing up", async () => {
  const cacheReads: string[][] = [];
  const lookups: string[] = [];
  const rows = await buildDesiredKanjiCards(db, "u1", [vocab({ kanji_selection: [] })], {
    getCachedKanji: async (_supabase, characters) => {
      cacheReads.push(characters);
      return {};
    },
    getKanji: async (_supabase, character) => {
      lookups.push(character);
      return info(character, 5);
    },
    segment: async () => [],
  });
  assert.deepEqual(rows, []);
  assert.deepEqual(cacheReads, []);
  assert.deepEqual(lookups, []);
});
