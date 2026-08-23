-- Migration: per-word example sentence.
-- Run once in the Supabase SQL editor AFTER 0010_kanji_prompt_hints.sql. Idempotent.
--
-- Gives every word an optional example sentence (the word used in context). It
-- is shown on the answer side of every flashcard, under the meaning and tip, so
-- the sentence is denormalized onto kanji_cards the same way `word_meaning`
-- already is — the smart deck reads its faces straight off kanji_cards.

alter table public.vocab
  add column if not exists sentence text;

alter table public.kanji_cards
  add column if not exists word_sentence text;

-- No backfill needed. Existing words have no sentence yet, and the normal
-- kanji-card reconciliation (which runs when a study deck opens, and on every
-- word insert/update) fills word_sentence while preserving card identity and
-- every SRS column.
