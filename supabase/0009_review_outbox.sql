-- Migration: idempotent review commands for the sequential client outbox.
-- Run AFTER 0008_atomic_reviews.sql.

alter table public.reviews
  add column if not exists client_review_id uuid;

create unique index if not exists reviews_user_client_review_uidx
  on public.reviews (user_id, client_review_id)
  where client_review_id is not null;

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
  p_client_review_id uuid
)
returns setof public.kanji_cards
language plpgsql
set search_path = public
as $$
declare
  card public.kanji_cards%rowtype;
  prior_review public.reviews%rowtype;
begin
  if p_client_review_id is null then
    raise exception 'client review id is required' using errcode = '22023';
  end if;

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
      or prior_review.mode is distinct from 'kanji_char'
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
  if card.last_reviewed_at is distinct from p_expected_last_reviewed_at then
    raise exception 'This card was reviewed elsewhere. Refresh and try again.'
      using errcode = '40001';
  end if;

  if p_apply_schedule then
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
    p_card_id, auth.uid(), p_grade, 'kanji_char', p_reviewed_at,
    p_interval_before, p_interval_after, p_ease_after, p_elapsed_days,
    p_client_review_id
  );

  return next card;
end;
$$;

create or replace function public.commit_vocab_review(
  p_vocab_id uuid,
  p_mode text,
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
  p_client_review_id uuid
)
returns setof public.vocab
language plpgsql
set search_path = public
as $$
declare
  card public.vocab%rowtype;
  prior_review public.reviews%rowtype;
  current_last_reviewed_at timestamptz;
begin
  if p_mode not in ('word', 'kanji') then
    raise exception 'Invalid review mode' using errcode = '22023';
  end if;
  if p_client_review_id is null then
    raise exception 'client review id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_client_review_id::text, 0)
  );

  select * into prior_review
  from public.reviews
  where user_id = auth.uid() and client_review_id = p_client_review_id;

  if found then
    if prior_review.vocab_id is distinct from p_vocab_id
      or prior_review.mode is distinct from p_mode
      or prior_review.grade is distinct from p_grade then
      raise exception 'client review id was already used for another review'
        using errcode = '22023';
    end if;
    select * into card
    from public.vocab
    where id = p_vocab_id and user_id = auth.uid();
    if found then
      return next card;
    end if;
    return;
  end if;

  select * into card
  from public.vocab
  where id = p_vocab_id and user_id = auth.uid()
  for update;

  if not found then
    return;
  end if;
  if p_mode = 'kanji' and not card.study_as_kanji then
    return;
  end if;
  current_last_reviewed_at := case
    when p_mode = 'kanji' then card.kanji_last_reviewed_at
    else card.last_reviewed_at
  end;
  if current_last_reviewed_at is distinct from p_expected_last_reviewed_at then
    raise exception 'This card was reviewed elsewhere. Refresh and try again.'
      using errcode = '40001';
  end if;

  if p_apply_schedule and p_mode = 'kanji' then
    update public.vocab
    set kanji_ease = p_ease,
        kanji_interval_days = p_interval_days,
        kanji_reps = p_reps,
        kanji_lapses = p_lapses,
        kanji_state = p_state,
        kanji_due_at = p_due_at,
        kanji_last_reviewed_at = p_last_reviewed_at
    where id = p_vocab_id
    returning * into card;
  elsif p_apply_schedule then
    update public.vocab
    set ease = p_ease,
        interval_days = p_interval_days,
        reps = p_reps,
        lapses = p_lapses,
        state = p_state,
        due_at = p_due_at,
        last_reviewed_at = p_last_reviewed_at
    where id = p_vocab_id
    returning * into card;
  end if;

  insert into public.reviews (
    vocab_id, user_id, grade, mode, reviewed_at,
    interval_before, interval_after, ease_after, elapsed_days,
    client_review_id
  ) values (
    p_vocab_id, auth.uid(), p_grade, p_mode, p_reviewed_at,
    p_interval_before, p_interval_after, p_ease_after, p_elapsed_days,
    p_client_review_id
  );

  return next card;
end;
$$;

-- The UUID parameter gives these functions new signatures. Remove the 0008
-- overloads only after both replacements exist, so a partially-run migration
-- cannot leave review persistence unavailable.
drop function if exists public.commit_kanji_card_review(
  uuid, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz
);
drop function if exists public.commit_vocab_review(
  uuid, text, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz
);

revoke all on function public.commit_kanji_card_review(
  uuid, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid
) from public;
grant execute on function public.commit_kanji_card_review(
  uuid, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid
) to authenticated;

revoke all on function public.commit_vocab_review(
  uuid, text, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid
) from public;
grant execute on function public.commit_vocab_review(
  uuid, text, timestamptz, boolean, real, real, integer, integer, text,
  timestamptz, timestamptz, text, real, real, real, real, timestamptz, uuid
) to authenticated;
