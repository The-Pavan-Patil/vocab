-- Migration: spaced-repetition scheduling.
-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- AFTER 0002_auth_rls.sql. Safe to re-run (idempotent).
--
-- Adds per-card SM-2 scheduling state to `vocab`, plus an append-only `reviews`
-- log. The log is not used by the scheduler today; it is captured so a future
-- upgrade to FSRS (which trains on review history) has the data it needs.
-- See docs/spaced-repetition.md for the design.

-- 1. SRS state columns on each vocab card. Defaults match lib/srs.ts:newState():
--    new cards start with ease 2.5, no interval, and a NULL due date (= due now).
alter table public.vocab
  add column if not exists ease             real        not null default 2.5,
  add column if not exists interval_days    real        not null default 0,
  add column if not exists reps             integer     not null default 0,
  add column if not exists lapses           integer     not null default 0,
  add column if not exists state            text        not null default 'new',
  add column if not exists due_at           timestamptz,            -- NULL = never reviewed
  add column if not exists last_reviewed_at timestamptz;

-- Index for "what's due for me right now" queue building.
create index if not exists vocab_due_idx on public.vocab (user_id, due_at);

-- 2. Append-only review log: one row per graded review. `grade` is the raw UI
--    signal (remember | right | wrong); the numeric snapshots support analytics
--    (retention %, streaks) and future FSRS parameter training.
create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  vocab_id        uuid not null references public.vocab (id) on delete cascade,
  user_id         uuid not null default auth.uid()
                    references auth.users (id) on delete cascade,
  grade           text not null check (grade in ('remember', 'right', 'wrong')),
  reviewed_at     timestamptz not null default now(),
  interval_before real,        -- gap (days) the card had before this review
  interval_after  real,        -- gap (days) scheduled after this review
  ease_after      real,        -- ease factor after this review
  elapsed_days    real         -- actual days waited since the previous review
);

create index if not exists reviews_user_idx on public.reviews (user_id, reviewed_at desc);
create index if not exists reviews_vocab_idx on public.reviews (vocab_id);

-- 3. Row Level Security on reviews — mirrors the vocab policies in 0002: a user
--    may only read and insert their own rows. (No update/delete: it's a log.)
alter table public.reviews enable row level security;

drop policy if exists reviews_select_own on public.reviews;
drop policy if exists reviews_insert_own on public.reviews;

create policy reviews_select_own on public.reviews
  for select using (auth.uid() = user_id);

create policy reviews_insert_own on public.reviews
  for insert with check (auth.uid() = user_id);
