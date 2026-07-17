-- Migration: lossless Smart Kanji reconciliation.
-- Run AFTER 0006_kanji_selection.sql.
--
-- Card identity is the source vocab row + character, not mutable word text.
-- Inactive cards retain their SRS history when a user turns a word/character off.

alter table public.kanji_cards
  add column if not exists active boolean not null default true;

-- Older/manual rows may not carry vocab_id. Recover the relationship by the old
-- source-word identity when possible. Anything still unmatched is archived, not
-- deleted, so its schedule and review history remain available for recovery.
update public.kanji_cards as card
set vocab_id = (
  select word.id
  from public.vocab as word
  where word.user_id = card.user_id and word.kanji = card.word
  order by word.created_at asc
  limit 1
)
where card.vocab_id is null
  and exists (
    select 1
    from public.vocab as word
    where word.user_id = card.user_id and word.kanji = card.word
  );

update public.kanji_cards
set active = false
where vocab_id is null;

-- A rename under the old (user, character, word) identity may have created more
-- than one row for the same vocab/character. Keep the most recently reviewed (or
-- most mature) schedule and move every duplicate's review history onto it before
-- adding the new uniqueness rule.
with ranked as (
  select
    id,
    first_value(id) over (
      partition by user_id, vocab_id, character
      order by last_reviewed_at desc nulls last, reps desc, created_at asc
    ) as keeper_id,
    row_number() over (
      partition by user_id, vocab_id, character
      order by last_reviewed_at desc nulls last, reps desc, created_at asc
    ) as position
  from public.kanji_cards
  where vocab_id is not null
)
update public.reviews as review
set kanji_card_id = ranked.keeper_id
from ranked
where review.kanji_card_id = ranked.id and ranked.position > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, vocab_id, character
      order by last_reviewed_at desc nulls last, reps desc, created_at asc
    ) as position
  from public.kanji_cards
  where vocab_id is not null
)
delete from public.kanji_cards as card
using ranked
where card.id = ranked.id and ranked.position > 1;

alter table public.kanji_cards
  drop constraint if exists kanji_cards_user_id_character_word_key;

create unique index if not exists kanji_cards_user_vocab_character_uidx
  on public.kanji_cards (user_id, vocab_id, character);

create index if not exists kanji_cards_active_due_idx
  on public.kanji_cards (user_id, jlpt, due_at)
  where active;

-- Repair malformed legacy JSON before enforcing the array/null storage shape.
update public.vocab
set kanji_selection = null
where kanji_selection is not null
  and jsonb_typeof(kanji_selection) <> 'array';

alter table public.vocab
  drop constraint if exists vocab_kanji_selection_array_check;
alter table public.vocab
  add constraint vocab_kanji_selection_array_check
  check (kanji_selection is null or jsonb_typeof(kanji_selection) = 'array');
