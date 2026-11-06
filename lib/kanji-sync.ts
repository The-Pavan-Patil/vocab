// ---------------------------------------------------------------------------
// Smart-deck reconciliation — project vocab selections into kanji_cards while
// preserving each card's independent SRS schedule.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KanjiInfo, KanjiPromptPart, Vocab } from "./types.ts";
import { getCachedKanji, getKanji } from "./kanjiapi.ts";
import { kanjiChars } from "./kanji-deck.ts";
import { selectionForWord } from "./kanji-selection.ts";
import { selectAll } from "./supabase/select-all.ts";
import {
  segment,
  dottedReading,
  segmentsFromRomaji,
  singleKanjiReadings,
  splitCompoundSegments,
  type FuriganaSegment,
} from "./furigana.ts";

export type ExistingKanjiCard = {
  id: string;
  vocab_id: string | null;
  character: string;
  active: boolean;
};

export type DesiredKanjiCard = {
  user_id: string;
  vocab_id: string;
  character: string;
  active: true;
  jlpt: number | null;
  word: string;
  word_meaning: string | null;
  word_sentence: string | null;
  reading?: string | null;
  word_reading?: string | null;
  word_prompt_parts?: KanjiPromptPart[] | null;
};

export type KanjiSyncStats = {
  created: number;
  updated: number;
  activated: number;
  deactivated: number;
};

type KanjiSyncDependencies = {
  getKanji: typeof getKanji;
  segment: typeof segment;
  /** Reads the kanji cache for many characters at once; without it, every
   *  character goes through getKanji on its own. */
  getCachedKanji?: typeof getCachedKanji;
};

type KanjiSyncOptions = {
  /** Full-deck reconciliation also deactivates cards outside `words`. */
  full?: boolean;
  dependencies?: KanjiSyncDependencies;
};

// Kanji fetched from kanjiapi.dev at once when the cache misses them.
const LOOKUP_CONCURRENCY = 8;
// Ids per `in` filter, so a large import or deactivation stays well inside
// URL limits.
const IDS_PER_REQUEST = 100;

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// The cards a reconciliation compares against: every card of the user for a
// full sync (paged — PostgREST truncates at max rows), else those of `vocabIds`.
async function readExistingCards(
  supabase: SupabaseClient,
  userId: string,
  vocabIds: string[],
  full: boolean
): Promise<ExistingKanjiCard[]> {
  const columns = "id,vocab_id,character,active";
  if (full) {
    return selectAll<ExistingKanjiCard>((from, to) =>
      supabase
        .from("kanji_cards")
        .select(columns, { count: "exact" })
        .eq("user_id", userId)
        .order("id")
        .range(from, to)
    );
  }
  const pages = await Promise.all(
    chunks(vocabIds, IDS_PER_REQUEST).map((ids) =>
      selectAll<ExistingKanjiCard>((from, to) =>
        supabase
          .from("kanji_cards")
          .select(columns, { count: "exact" })
          .eq("user_id", userId)
          .in("vocab_id", ids)
          .order("id")
          .range(from, to)
      )
    )
  );
  return pages.flat();
}

const cardKey = (vocabId: string | null, character: string) =>
  `${vocabId ?? ""}\u0000${character}`;

/**
 * Preserve the analyzer's ordered segments while revealing readings only for
 * segments made entirely from kanji the user turned off. A mixed segment such
 * as 今日=きょう stays unhinted if either character is selected because its
 * reading cannot be split safely between the characters.
 */
export function buildWordPromptParts(
  segments: FuriganaSegment[],
  selectedCharacters: string[]
): KanjiPromptPart[] {
  const selected = new Set(selectedCharacters);
  return segments.map((segment) => {
    const characters = kanjiChars(segment.surface);
    const canReveal =
      segment.isKanji &&
      characters.length > 0 &&
      characters.every((character) => !selected.has(character));
    return {
      surface: segment.surface,
      reading: canReveal ? segment.reading : null,
    };
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  map: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await map(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

/** Build desired active rows without touching the database. */
export async function buildDesiredKanjiCards(
  supabase: SupabaseClient,
  userId: string,
  words: Vocab[],
  dependencies: KanjiSyncDependencies = {
    getKanji,
    segment,
    getCachedKanji,
  }
): Promise<DesiredKanjiCard[]> {
  const toggled = words.filter((word) => word.study_as_kanji);
  const charactersOf = (word: Vocab) =>
    Array.isArray(word.kanji_selection)
      ? selectionForWord(word.kanji, word.kanji_selection) ?? []
      : kanjiChars(word.kanji);
  // Every kanji of the toggled words that have cards to make: the selected
  // ones become cards, and the rest still split compound readings.
  const allCharacters = [
    ...new Set(
      toggled
        .filter((word) => charactersOf(word).length > 0)
        .flatMap((word) => kanjiChars(word.kanji))
    ),
  ];

  // One cache read for all of them. A failed read isn't fatal: those
  // characters just go through getKanji, which checks the cache itself.
  let cached: Record<string, KanjiInfo> = {};
  if (dependencies.getCachedKanji && allCharacters.length > 0) {
    try {
      cached = await dependencies.getCachedKanji(supabase, allCharacters);
    } catch {
      cached = {};
    }
  }

  const infoPromises = new Map<string, Promise<KanjiInfo | null>>();
  const loadInfo = (character: string) => {
    const pending = infoPromises.get(character);
    if (pending) return pending;
    const hit = cached[character];
    const request = hit
      ? Promise.resolve(hit)
      : dependencies.getKanji(supabase, character);
    infoPromises.set(character, request);
    return request;
  };

  // Look up the characters the cache doesn't have yet (kanjiapi.dev) up front,
  // several at a time, rather than a word at a time. A failed lookup stays in
  // `infoPromises`, so a word that selects that kanji still fails the sync
  // below, while a kanji used only to split readings is skipped.
  await mapWithConcurrency(
    allCharacters.filter((character) => !cached[character]),
    LOOKUP_CONCURRENCY,
    (character) => loadInfo(character).catch(() => null)
  );

  const rowsByWord = await mapWithConcurrency(toggled, 4, async (word) => {
    const explicit = Array.isArray(word.kanji_selection);
    const characters = charactersOf(word);
    if (characters.length === 0) return [];

    let segments: FuriganaSegment[] | null = null;
    try {
      segments = await dependencies.segment(word.kanji);
    } catch {
      // Preserve previously-synced reading fields when analysis temporarily
      // fails. New rows simply receive the database's null defaults.
    }
    // The analyzer reads the bare word without context and misreads some
    // (一本 = いちほん); the romaji saved on the word wins when it disagrees.
    if (segments) {
      segments = segmentsFromRomaji(word.kanji, word.romaji, segments) ?? segments;
    }
    const infos = await Promise.all(characters.map(loadInfo));
    if (segments) {
      // The analyzer keeps a compound as one run (上手 = じょうず); split it per
      // kanji where the dictionary readings line up, so a turned-off kanji gets
      // its own hint. Every kanji of the word is looked up for this, but only
      // as a best effort: a failed lookup just leaves its run whole.
      const readingInfos = new Map(
        await Promise.all(
          kanjiChars(word.kanji).map(
            async (character) =>
              [character, await loadInfo(character).catch(() => null)] as const
          )
        )
      );
      segments = splitCompoundSegments(segments, (character) => {
        const info = readingInfos.get(character);
        return info ? [...info.on, ...info.kun] : [];
      });
    }
    const wordReading = segments ? dottedReading(segments) || null : null;
    const readings = segments ? singleKanjiReadings(segments) : null;
    const promptSelectedCharacters = explicit
      ? characters
      : characters.filter((_, index) => infos[index]?.jlpt != null);
    const wordPromptParts = segments
      ? buildWordPromptParts(segments, promptSelectedCharacters)
      : null;

    return characters.flatMap((character, index): DesiredKanjiCard[] => {
      const info = infos[index];
      if (!info || (!explicit && info.jlpt == null)) return [];
      const row: DesiredKanjiCard = {
        user_id: userId,
        vocab_id: word.id,
        character,
        active: true,
        jlpt: info.jlpt,
        word: word.kanji,
        word_meaning: word.english,
        word_sentence: word.sentence,
      };
      if (segments) {
        row.reading = readings?.get(character) ?? null;
        row.word_reading = wordReading;
        row.word_prompt_parts = wordPromptParts;
      }
      return [row];
    });
  });

  return rowsByWord.flat();
}

/** Pure plan used by reconciliation and characterization tests. */
export function planKanjiReconciliation(
  existing: ExistingKanjiCard[],
  desired: DesiredKanjiCard[]
): KanjiSyncStats & { deactivateIds: string[] } {
  const existingByKey = new Map(
    existing.map((card) => [cardKey(card.vocab_id, card.character), card])
  );
  const desiredKeys = new Set(
    desired.map((card) => cardKey(card.vocab_id, card.character))
  );
  let created = 0;
  let updated = 0;
  let activated = 0;
  for (const row of desired) {
    const current = existingByKey.get(cardKey(row.vocab_id, row.character));
    if (!current) created += 1;
    else if (!current.active) activated += 1;
    else updated += 1;
  }
  const deactivateIds = existing
    .filter(
      (card) =>
        card.active && !desiredKeys.has(cardKey(card.vocab_id, card.character))
    )
    .map((card) => card.id);
  return {
    created,
    updated,
    activated,
    deactivated: deactivateIds.length,
    deactivateIds,
  };
}

/**
 * Reconcile some or all vocab rows with kanji_cards. Metadata and `active` are
 * updated on conflict; SRS columns are intentionally absent, so their history is
 * never reset. Deselected/toggled-off cards are retained as inactive.
 */
export async function syncKanjiCards(
  supabase: SupabaseClient,
  userId: string,
  words: Vocab[],
  options: KanjiSyncOptions = {}
): Promise<KanjiSyncStats> {
  const vocabIds = [...new Set(words.map((word) => word.id))];
  if (!options.full && vocabIds.length === 0) {
    return { created: 0, updated: 0, activated: 0, deactivated: 0 };
  }

  // The current cards don't depend on the desired ones: read them meanwhile.
  const [desired, existing] = await Promise.all([
    buildDesiredKanjiCards(supabase, userId, words, options.dependencies),
    readExistingCards(supabase, userId, vocabIds, options.full === true),
  ]);
  const plan = planKanjiReconciliation(existing, desired);

  // The writes touch disjoint rows — each upsert payload has its own cards and
  // deactivation only cards outside both — so they go out together. If one
  // fails the others still land (each is idempotent), the sync reports the
  // failure, and a retry finishes the rest.
  const writes: PromiseLike<{ error: { message: string } | null }>[] = [];
  // Keep failed-segmentation rows in a separate payload. PostgREST bulk rows
  // share a column shape; mixing omitted reading fields with populated ones can
  // turn the omissions into nulls and erase previously-known readings.
  const withReadings = desired.filter((row) => "reading" in row);
  const withoutReadings = desired.filter((row) => !("reading" in row));
  for (const rows of [withReadings, withoutReadings]) {
    if (rows.length === 0) continue;
    writes.push(
      supabase.from("kanji_cards").upsert(rows, {
        onConflict: "user_id,vocab_id,character",
        ignoreDuplicates: false,
      })
    );
  }
  for (const ids of chunks(plan.deactivateIds, IDS_PER_REQUEST)) {
    writes.push(
      supabase
        .from("kanji_cards")
        .update({ active: false })
        .eq("user_id", userId)
        .in("id", ids)
    );
  }
  const failed = (await Promise.all(writes)).find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);

  return {
    created: plan.created,
    updated: plan.updated,
    activated: plan.activated,
    deactivated: plan.deactivated,
  };
}
