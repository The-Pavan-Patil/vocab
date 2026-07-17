-- Base bootstrap schema. Run this first, then apply 0002_auth_rls.sql through
-- 0008_atomic_reviews.sql in numeric order. Those migrations are the source of
-- truth for the authenticated study decks and current schema.

create extension if not exists "pgcrypto"; -- for gen_random_uuid()

create table if not exists vocab (
  id          uuid primary key default gen_random_uuid(),
  kanji       text not null,
  romaji      text,
  english     text,
  tips        text,          -- Marathi meaning / mnemonic
  category    text,          -- noun | verb | adjective | adverb | particle | phrase | other
  created_at  timestamptz not null default now()
);

create index if not exists vocab_created_at_idx on vocab (created_at desc);

-- Authentication ownership and RLS are added by 0002_auth_rls.sql.
