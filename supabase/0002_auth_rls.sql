-- Migration: per-user vocab lists + Row Level Security.
-- Run this in the Supabase SQL editor AFTER the owner account has signed up at
-- least once through /login (so a row exists in auth.users to backfill onto).
--
-- IMPORTANT: keep the steps in this order. Existing rows have no user_id, so the
-- column is added NULLABLE, backfilled, and only then made NOT NULL — doing it
-- the other way fails on the pre-existing rows.

-- 0. Set the owner email whose account inherits the existing words.
--    Replace with the email you signed up with.
\set owner_email 'tech@ownpath.com'

-- 1. Add user_id (nullable first), referencing auth.users.
alter table public.vocab
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- 2. Backfill all pre-auth rows to the owner account.
update public.vocab
set user_id = (select id from auth.users where email = :'owner_email')
where user_id is null;

-- Safety check: this should report 0. If it doesn't, the owner hasn't signed up
-- yet (or the email is wrong) — fix that before continuing, or enabling RLS will
-- hide those rows from everyone.
-- select count(*) as orphaned from public.vocab where user_id is null;

-- 3. Now enforce ownership for all future rows.
alter table public.vocab
  alter column user_id set not null,
  alter column user_id set default auth.uid();

-- 4. Index for per-user lookups.
create index if not exists vocab_user_id_idx on public.vocab (user_id);

-- 5. Turn on RLS (until now the table was open).
alter table public.vocab enable row level security;

-- 6. One policy per operation: a user may only touch their own rows.
drop policy if exists vocab_select_own on public.vocab;
drop policy if exists vocab_insert_own on public.vocab;
drop policy if exists vocab_update_own on public.vocab;
drop policy if exists vocab_delete_own on public.vocab;

create policy vocab_select_own on public.vocab
  for select using (auth.uid() = user_id);

create policy vocab_insert_own on public.vocab
  for insert with check (auth.uid() = user_id);

create policy vocab_update_own on public.vocab
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy vocab_delete_own on public.vocab
  for delete using (auth.uid() = user_id);
