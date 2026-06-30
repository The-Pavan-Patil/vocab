// ---------------------------------------------------------------------------
// Smart-deck sync — turn `study_as_kanji` words into kanji_cards.
//
// For each toggled word, create one card per kanji (that has a JLPT level),
// tagged with the kanji's level and its reading-in-this-word. Idempotent via the
// (user_id, character, word) unique constraint, so re-running never resets an
// existing card's schedule. Server-only (uses kanjiapi + kuroshiro).
// ---------------------------------------------------------------------------

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vocab } from "./types";
import { getKanji } from "./kanjiapi";
import { kanjiChars } from "./kanji-deck";
import { segment, dottedReading, singleKanjiReadings } from "./furigana";

/**
 * Ensure kanji_cards exist for every `study_as_kanji` word in `words`. Returns
 * how many new cards were inserted (existing cards are left untouched).
 */
export async function syncKanjiCards(
  supabase: SupabaseClient,
  userId: string,
  words: Vocab[]
): Promise<number> {
  const toggled = words.filter((w) => w.study_as_kanji && kanjiChars(w.kanji).length > 0);
  const rows: Record<string, unknown>[] = [];

  for (const w of toggled) {
    const chars = kanjiChars(w.kanji);
    if (chars.length === 0) continue;

    const segs = await segment(w.kanji).catch(() => []);
    // Stored dotted (い.く) so the card back can show the kanji reading apart
    // from its okurigana.
    const wordReading = dottedReading(segs) || null;
    const readings = singleKanjiReadings(segs);

    for (const ch of chars) {
      const info = await getKanji(supabase, ch);
      // Only JLPT-graded kanji become smart cards (the deck is filtered by level).
      if (!info || info.jlpt == null) continue;
      rows.push({
        user_id: userId,
        character: ch,
        jlpt: info.jlpt,
        word: w.kanji,
        reading: readings.get(ch) ?? null,
        word_reading: wordReading,
        word_meaning: w.english,
        vocab_id: w.id,
      });
    }
  }

  if (rows.length === 0) return 0;
  // ignoreDuplicates → never overwrite an existing card's SRS schedule.
  const { data, error } = await supabase
    .from("kanji_cards")
    .upsert(rows, { onConflict: "user_id,character,word", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
