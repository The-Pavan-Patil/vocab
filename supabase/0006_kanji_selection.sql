-- Migration: per-kanji study selection.
-- Run once in the Supabase SQL editor AFTER 0005_kanji_smart.sql. Idempotent.
--
-- Lets a word record WHICH of its kanji the user opted to study as smart cards,
-- instead of the all-or-nothing default (every JLPT-graded kanji). The Add-word
-- breakdown writes the chosen characters here; syncKanjiCards (lib/kanji-sync.ts)
-- honors it. NULL = "not curated" → fall back to the old default (all graded),
-- so existing rows and Dictionary/Import adds are unchanged.

alter table public.vocab
  add column if not exists kanji_selection jsonb;  -- array of chosen kanji chars; NULL = all graded (default)
