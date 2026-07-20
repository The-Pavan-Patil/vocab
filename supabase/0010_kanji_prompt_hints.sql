-- Migration: safe furigana hints for turned-off kanji in All Kanjis prompts.
-- Run AFTER 0009_review_outbox.sql.

alter table public.kanji_cards
  add column if not exists word_prompt_parts jsonb;

alter table public.kanji_cards
  drop constraint if exists kanji_cards_word_prompt_parts_array_check;
alter table public.kanji_cards
  add constraint kanji_cards_word_prompt_parts_array_check
  check (
    word_prompt_parts is null
    or jsonb_typeof(word_prompt_parts) = 'array'
  );

-- No SQL backfill is needed. The normal full kanji-card reconciliation runs
-- when a study deck first opens and fills this analyzer-derived metadata while
-- preserving card identity and every SRS column.
