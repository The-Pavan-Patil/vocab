-- Migration: evaluate auth.uid() once per query in every RLS policy.
-- Run AFTER 0012_all_kanji_schedule.sql. Safe to re-run (idempotent).
--
-- A policy written `auth.uid() = user_id` calls auth.uid() for every row it
-- checks. Wrapped as `(select auth.uid())` Postgres evaluates it once per
-- statement (an initPlan) and compares a constant — Supabase's recommended
-- form (Database Advisor: auth_rls_initplan). Same rules, same access; only
-- the plan changes. One transaction, so no request ever sees a table with its
-- policy dropped. Best run while the app is idle: it briefly locks each table,
-- and gives up (rather than waiting or deadlocking) if a request holds one.

begin;
set local lock_timeout = '5s';

-- vocab (0002_auth_rls.sql)
drop policy if exists vocab_select_own on public.vocab;
drop policy if exists vocab_insert_own on public.vocab;
drop policy if exists vocab_update_own on public.vocab;
drop policy if exists vocab_delete_own on public.vocab;
create policy vocab_select_own on public.vocab
  for select using ((select auth.uid()) = user_id);
create policy vocab_insert_own on public.vocab
  for insert with check ((select auth.uid()) = user_id);
create policy vocab_update_own on public.vocab
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy vocab_delete_own on public.vocab
  for delete using ((select auth.uid()) = user_id);

-- reviews (0003_srs.sql)
drop policy if exists reviews_select_own on public.reviews;
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_select_own on public.reviews
  for select using ((select auth.uid()) = user_id);
create policy reviews_insert_own on public.reviews
  for insert with check ((select auth.uid()) = user_id);

-- kanji reference cache (0005_kanji_smart.sql)
drop policy if exists kanji_select_auth on public.kanji;
drop policy if exists kanji_insert_auth on public.kanji;
drop policy if exists kanji_update_auth on public.kanji;
create policy kanji_select_auth on public.kanji
  for select using ((select auth.uid()) is not null);
create policy kanji_insert_auth on public.kanji
  for insert with check ((select auth.uid()) is not null);
create policy kanji_update_auth on public.kanji
  for update using ((select auth.uid()) is not null)
  with check ((select auth.uid()) is not null);

-- kanji_cards (0005_kanji_smart.sql)
drop policy if exists kanji_cards_select_own on public.kanji_cards;
drop policy if exists kanji_cards_insert_own on public.kanji_cards;
drop policy if exists kanji_cards_update_own on public.kanji_cards;
drop policy if exists kanji_cards_delete_own on public.kanji_cards;
create policy kanji_cards_select_own on public.kanji_cards
  for select using ((select auth.uid()) = user_id);
create policy kanji_cards_insert_own on public.kanji_cards
  for insert with check ((select auth.uid()) = user_id);
create policy kanji_cards_update_own on public.kanji_cards
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy kanji_cards_delete_own on public.kanji_cards
  for delete using ((select auth.uid()) = user_id);

commit;
