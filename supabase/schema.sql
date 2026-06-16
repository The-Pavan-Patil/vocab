-- Run this once in the Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Creates the single table used by the Japanese vocabulary study app.

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

-- No login is used; all access goes through server-side API routes that use the
-- service-role key. RLS is intentionally left disabled.
