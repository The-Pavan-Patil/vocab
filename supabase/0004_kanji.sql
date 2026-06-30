-- Migration: Kanji study deck.
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- AFTER 0003_srs.sql. Safe to re-run (idempotent).
--
-- Lets a word be studied as a SECOND card — a "kanji" card that shows only the
-- written form (no reading) — with its OWN spaced-repetition schedule, separate
-- from the word card. A word opts in via `study_as_kanji`; its kanji schedule
-- lives in a parallel set of `kanji_*` columns that mirror the base SRS columns
-- from 0003. The scheduler (lib/srs.ts) is reused with kanji-specific tuning.
-- See docs/spaced-repetition.md.

-- 1. Opt-in flag + a parallel SRS column set for the kanji track. Defaults match
--    lib/srs.ts:newState() exactly like the base columns: ease 2.5, no interval,
--    NULL due date (= a brand-new kanji card, due now).
alter table public.vocab
  add column if not exists study_as_kanji         boolean     not null default false,
  add column if not exists kanji_ease             real        not null default 2.5,
  add column if not exists kanji_interval_days    real        not null default 0,
  add column if not exists kanji_reps             integer     not null default 0,
  add column if not exists kanji_lapses           integer     not null default 0,
  add column if not exists kanji_state            text        not null default 'new',
  add column if not exists kanji_due_at           timestamptz,            -- NULL = never reviewed
  add column if not exists kanji_last_reviewed_at timestamptz;

-- Index for building the "kanji due for me right now" queue (mirrors vocab_due_idx).
create index if not exists vocab_kanji_due_idx on public.vocab (user_id, kanji_due_at);

-- 2. Tag each review with which deck it belongs to, so the append-only log (and
--    future stats / FSRS training) can tell the word track from the kanji track.
--    Existing rows are all word reviews → default 'word'.
alter table public.reviews
  add column if not exists mode text not null default 'word'
    check (mode in ('word', 'kanji'));
