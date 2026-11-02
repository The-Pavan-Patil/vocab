-- Migration: an independent schedule for the All Kanji deck.
-- Run once in the Supabase SQL editor AFTER 0011_vocab_sentence.sql. Idempotent.
-- Apply it BEFORE deploying the code that sends `p_deck` — the new parameter
-- has a default, so code that predates it keeps working in the meantime.
--
-- Smart Kanji and All Kanji study the same kanji_cards rows. Until now they
-- also shared one schedule (the base SRS columns), so grading a card in All
-- Kanji moved its Smart Kanji due date. This gives All Kanji its own parallel
-- all_* columns — the same pattern 0004 used for the vocab kanji_* track — and
-- logs its reviews under their own 'kanji_all' mode. See lib/decks.ts.

-- 1. All Kanji's schedule. Every card starts fresh (new, never reviewed); the
--    base columns stay Smart Kanji's. The kanji-card reconciliation never
--    writes SRS columns, so a resync can't reset either schedule.
alter table public.kanji_cards
  add column if not exists all_ease             real        not null default 2.5,
  add column if not exists all_interval_days    real        not null default 0,
  add column if not exists all_reps             integer     not null default 0,
  add column if not exists all_lapses           integer     not null default 0,
  add column if not exists all_state            text        not null default 'new',
  add column if not exists all_due_at           timestamptz,
  add column if not exists all_last_reviewed_at timestamptz;

create index if not exists kanji_cards_active_all_due_idx
  on public.kanji_cards (user_id, all_due_at)
  where active;

-- 2. Review log mode for All Kanji.
alter table public.reviews drop constraint if exists reviews_mode_check;
alter table public.reviews
  add constraint reviews_mode_check
  check (mode in ('word', 'kanji', 'kanji_char', 'kanji_all'));

-- 3. The study decks no longer reconcile every card on open, which is what
--    used to refresh the word text copied onto each card. Bring it up to date
--    once here; adding, editing and importing a word keep it current after.
update public.kanji_cards as card
set word = v.kanji,
    word_meaning = v.english,
    word_sentence = v.sentence
from public.vocab as v
where card.vocab_id = v.id
  and (
    card.word is distinct from v.kanji
    or card.word_meaning is distinct from v.english
    or card.word_sentence is distinct from v.sentence
  );

-- 4. The review commit takes the deck. 'smart' (the default) writes the base
--    columns and logs 'kanji_char', exactly as before; 'all' writes all_* and
--    logs 'kanji_all'. The stale-review check reads the chosen deck's own
--    last_reviewed_at, so the two decks never conflict with each other.
create or replace function public.commit_kanji_card_review(
  p_card_id uuid,
  p_expected_last_reviewed_at timestamptz,
  p_apply_schedule boolean,
  p_ease real,
  p_interval_days real,
  p_reps integer,
  p_lapses integer,
  p_state text,
  p_due_at timestamptz,
  p_last_reviewed_at timestamptz,
  p_grade text,
  p_interval_before real,
  p_interval_after real,
  p_ease_after real,
  p_elapsed_days real,
  p_reviewed_at timestamptz,
  p_client_review_id uuid,
  p_deck text default 'smart'
)
returns setof public.kanji_cards
language plpgsql
set search_path = public
as $$
declare
  card public.kanji_cards%rowtype;
  prior_review public.reviews%rowtype;
  review_mode text;
  current_last_reviewed_at timestamptz;
begin
  if p_deck not in ('smart', 'all') then
    raise exception 'Invalid kanji deck' using errcode = '22023';
  end if;
  if p_client_review_id is null then
    raise exception 'client review id is required' using errcode = '22023';
  end if;
  review_mode := case when p_deck = 'all' then 'kanji_all' else 'kanji_char' end;

  -- Serialize retries of the same command, including a retry that reaches the
  -- database while the first request is still finishing after a lost response.
  perform pg_advisory_xact_lock(
    hashtextextended(p_client_review_id::text, 0)
  );

  select * into prior_review
  from public.reviews
  where user_id = auth.uid() and client_review_id = p_client_review_id;

  if found then
    if prior_review.kanji_card_id is distinct from p_card_id
      or prior_review.mode is distinct from review_mode
      or prior_review.grade is distinct from p_grade then
      raise exception 'client review id was already used for another review'
        using errcode = '22023';
    end if;
    select * into card
    from public.kanji_cards
    where id = p_card_id and user_id = auth.uid();
    if found then
      return next card;
    end if;
    return;
  end if;

  select * into card
  from public.kanji_cards
  where id = p_card_id and user_id = auth.uid() and active
  for update;

  if not found then
    return;
  end if;
  current_last_reviewed_at := case
    when p_deck = 'all' then card.all_last_reviewed_at
    else card.last_reviewed_at
  end;
  if current_last_reviewed_at is distinct from p_expected_last_reviewed_at then
    raise exception 'This card was reviewed elsewhere. Refresh and try again.'
      using errcode = '40001';
  end if;

  if p_apply_schedule and p_deck = 'all' then
    update public.kanji_cards
    set all_ease = p_ease,
        all_interval_days = p_interval_days,
        all_reps = p_reps,
        all_lapses = p_lapses,
        all_state = p_state,
        all_due_at = p_due_at,
        all_last_reviewed_at = p_last_reviewed_at
    where id = p_card_id
    returning * into card;
  elsif p_apply_schedule then
    update public.kanji_cards
    set ease = p_ease,
        interval_days = p_interval_days,
        reps = p_reps,
        lapses = p_lapses,
        state = p_state,
        due_at = p_due_at,
        last_reviewed_at = p_last_reviewed_at
    where id = p_card_id
    returning * into card;
  end if;

  insert into public.reviews (
    kanji_card_id, user_id, grade, mode, reviewed_at,
    interval_before, interval_after, ease_after, elapsed_days,
    client_review_id
  ) values (
    p_card_id, auth.uid(), p_grade, review_mode, p_reviewed_at,
    p_interval_before, p_interval_after, p_ease_after, p_elapsed_days,
    p_client_review_id
  );

  return next card;
end;
$$;

-- The trailing p_deck gives the function a new signature. Remove the 0009
-- overload only after the replacement exists, so a partially-run migration
-- cannot leave review persistence unavailable.
drop function if exists public.commit_kanji_card_review(
  uuid, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid
);

revoke all on function public.commit_kanji_card_review(
  uuid, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid,
  text
) from public;
grant execute on function public.commit_kanji_card_review(
  uuid, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid,
  text
) to authenticated;
