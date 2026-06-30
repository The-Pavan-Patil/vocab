-- Migration: "Smart" Kanji deck (kanji-in-word, JLPT-bucketed).
-- Run once in the Supabase SQL editor AFTER 0004_kanji.sql. Idempotent.
--
-- Adds a global kanji reference cache (from kanjiapi.dev) and a per-user
-- `kanji_cards` deck: one SRS card per (kanji, source word), tagged with the
-- kanji's JLPT level. Reuses the scheduler in lib/srs.ts (base-named SRS columns).
-- The existing word-level kanji deck (study_as_kanji + kanji_* columns) is
-- untouched; the same toggle now also feeds this deck. See docs/spaced-repetition.md.

-- 1. Global kanji reference cache, populated from kanjiapi.dev on first lookup.
--    Non-personal reference data → readable/writable by any signed-in user.
create table if not exists public.kanji (
  character     text primary key,
  meanings      jsonb       not null default '[]'::jsonb,
  on_readings   jsonb       not null default '[]'::jsonb,
  kun_readings  jsonb       not null default '[]'::jsonb,
  jlpt          integer,                              -- 5=N5 … 1=N1, NULL = not in JLPT
  grade         integer,
  stroke_count  integer,
  heisig_en     text,
  words         jsonb       not null default '[]'::jsonb,  -- example words [{written,pronounced,glosses}]
  fetched_at    timestamptz not null default now()
);

alter table public.kanji enable row level security;
drop policy if exists kanji_select_auth on public.kanji;
drop policy if exists kanji_insert_auth on public.kanji;
drop policy if exists kanji_update_auth on public.kanji;
create policy kanji_select_auth on public.kanji
  for select using (auth.uid() is not null);
create policy kanji_insert_auth on public.kanji
  for insert with check (auth.uid() is not null);
create policy kanji_update_auth on public.kanji
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

-- 2. The smart deck: one SRS card per (kanji, source word). SRS columns use the
--    base names so lib/srs.ts schedules them with no adapter.
create table if not exists public.kanji_cards (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid()
                      references auth.users (id) on delete cascade,
  character         text not null,
  jlpt              integer,                 -- denormalized from kanji for fast level filtering
  word              text not null,           -- the source word (e.g. 食べる)
  reading           text,                    -- the kanji's reading in this word (e.g. た)
  word_reading      text,                    -- full word reading (たべる)
  word_meaning      text,                    -- the word's English meaning
  vocab_id          uuid references public.vocab (id) on delete cascade,
  ease              real        not null default 2.5,
  interval_days     real        not null default 0,
  reps              integer     not null default 0,
  lapses            integer     not null default 0,
  state             text        not null default 'new',
  due_at            timestamptz,
  last_reviewed_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (user_id, character, word)
);

create index if not exists kanji_cards_due_idx
  on public.kanji_cards (user_id, jlpt, due_at);

alter table public.kanji_cards enable row level security;
drop policy if exists kanji_cards_select_own on public.kanji_cards;
drop policy if exists kanji_cards_insert_own on public.kanji_cards;
drop policy if exists kanji_cards_update_own on public.kanji_cards;
drop policy if exists kanji_cards_delete_own on public.kanji_cards;
create policy kanji_cards_select_own on public.kanji_cards
  for select using (auth.uid() = user_id);
create policy kanji_cards_insert_own on public.kanji_cards
  for insert with check (auth.uid() = user_id);
create policy kanji_cards_update_own on public.kanji_cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy kanji_cards_delete_own on public.kanji_cards
  for delete using (auth.uid() = user_id);

-- 3. Let the reviews log reference a kanji_card (smart deck) instead of a vocab
--    row, and add the 'kanji_char' mode.
alter table public.reviews alter column vocab_id drop not null;
alter table public.reviews
  add column if not exists kanji_card_id uuid references public.kanji_cards (id) on delete cascade;
alter table public.reviews drop constraint if exists reviews_mode_check;
alter table public.reviews
  add constraint reviews_mode_check check (mode in ('word', 'kanji', 'kanji_char'));
