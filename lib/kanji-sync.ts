// ---------------------------------------------------------------------------
// Smart-deck reconciliation — project vocab selections into kanji_cards while
// preserving each card's independent SRS schedule.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KanjiInfo, Vocab } from "./types.ts";
import { getKanji } from "./kanjiapi.ts";
import { kanjiChars } from "./kanji-deck.ts";
import { selectionForWord } from "./kanji-selection.ts";
import {
  segment,
  dottedReading,
  singleKanjiReadings,
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
  reading?: string | null;
  word_reading?: string | null;
};

export type KanjiSyncStats = {
  created: number;
  updated: number;
  activated: number;
  deactivated: number;
};

type KanjiSyncOptions = {
  /** Full-deck reconciliation also deactivates cards outside `words`. */
  full?: boolean;
  dependencies?: {
    getKanji: typeof getKanji;
    segment: typeof segment;
  };
};

const cardKey = (vocabId: string | null, character: string) =>
  `${vocabId ?? ""}\u0000${character}`;

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
  dependencies: NonNullable<KanjiSyncOptions["dependencies"]> = {
    getKanji,
    segment,
  }
): Promise<DesiredKanjiCard[]> {
  const infoPromises = new Map<string, Promise<KanjiInfo | null>>();
  const loadInfo = (character: string) => {
    const pending = infoPromises.get(character);
    if (pending) return pending;
    const request = dependencies.getKanji(supabase, character);
    infoPromises.set(character, request);
    return request;
  };

  const toggled = words.filter((word) => word.study_as_kanji);
  const rowsByWord = await mapWithConcurrency(toggled, 4, async (word) => {
    const explicit = Array.isArray(word.kanji_selection);
    const characters = explicit
      ? selectionForWord(word.kanji, word.kanji_selection) ?? []
      : kanjiChars(word.kanji);
    if (characters.length === 0) return [];

    let segments: FuriganaSegment[] | null = null;
    try {
      segments = await dependencies.segment(word.kanji);
    } catch {
      // Preserve previously-synced reading fields when analysis temporarily
      // fails. New rows simply receive the database's null defaults.
    }
    const wordReading = segments ? dottedReading(segments) || null : null;
    const readings = segments ? singleKanjiReadings(segments) : null;
    const infos = await Promise.all(characters.map(loadInfo));

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
      };
      if (segments) {
        row.reading = readings?.get(character) ?? null;
        row.word_reading = wordReading;
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

  const desired = await buildDesiredKanjiCards(
    supabase,
    userId,
    words,
    options.dependencies
  );

  let existingQuery = supabase
    .from("kanji_cards")
    .select("id,vocab_id,character,active")
    .eq("user_id", userId);
  if (!options.full) existingQuery = existingQuery.in("vocab_id", vocabIds);
  const { data: existingData, error: existingError } = await existingQuery;
  if (existingError) throw new Error(existingError.message);

  const existing = (existingData ?? []) as ExistingKanjiCard[];
  const plan = planKanjiReconciliation(existing, desired);

  if (desired.length > 0) {
    // Keep failed-segmentation rows in a separate payload. PostgREST bulk rows
    // share a column shape; mixing omitted reading fields with populated ones can
    // turn the omissions into nulls and erase previously-known readings.
    const withReadings = desired.filter((row) => "reading" in row);
    const withoutReadings = desired.filter((row) => !("reading" in row));
    for (const rows of [withReadings, withoutReadings]) {
      if (rows.length === 0) continue;
      const { error } = await supabase
        .from("kanji_cards")
        .upsert(rows, {
          onConflict: "user_id,vocab_id,character",
          ignoreDuplicates: false,
        });
      if (error) throw new Error(error.message);
    }
  }

  if (plan.deactivateIds.length > 0) {
    const { error } = await supabase
      .from("kanji_cards")
      .update({ active: false })
      .eq("user_id", userId)
      .in("id", plan.deactivateIds);
    if (error) throw new Error(error.message);
  }

  return {
    created: plan.created,
    updated: plan.updated,
    activated: plan.activated,
    deactivated: plan.deactivated,
  };
}
