# 日本語 Vocab - Making A Flashcard App Remember Correctly

## One-Line Summary

I built a public Japanese vocabulary study app that turns personal word lists into spaced-repetition flashcards, then redesigned its card identity and review pipeline so learners could study quickly without losing the schedules they had earned.

## Project Snapshot

| Field | Detail |
| --- | --- |
| Product | Japanese vocabulary and kanji study app |
| Role | Sole builder: product, data model, scheduler, auth, study flows, reliability fixes, tests, docs |
| Stack | Next.js 16, React 19, TypeScript, Supabase Auth/Postgres/RLS, Tailwind CSS, SM-2 scheduling |
| Status | Public learner app with private per-user vocab lists |
| Evidence base | Git history, migrations, current code, tests, design docs, developer confirmations |

## Context

日本語 Vocab started as a personal tool for studying Japanese vocabulary. Each word stores kanji, romaji, English meaning, Marathi tips, and category, so it reflects how I actually study: not just translation, but reading, recall, and contextual hints.

Once the app became useful beyond a local notebook, I opened it up with accounts and private per-user lists. That moved the project from a simple study interface into a system with user isolation, durable scheduling, import/export, and multiple study modes built on the same vocabulary data.

The visible product is intentionally lightweight: add words, import a file, search the list, and grade flashcards. The difficult engineering problem sat underneath that surface: a review is not just a button click. It is the learner's memory history, and the app has to preserve it even when words are edited, kanji are toggled, or the network is slow.

## The Challenge

The core product promise was simple:

> Show the right card at the right time, let the learner grade honestly, and keep the session fast enough that studying still feels focused.

Three constraints made that harder than it looked.

First, Japanese vocabulary creates more than one study question from the same row. Reading a full word from its glyphs is different from recognizing one kanji's reading inside that word. A single database row had to support multiple learning tracks without letting one track accidentally advance another.

Second, schedules had to survive editing. If a learner changes a word, turns a kanji off, or later reselects it, the app should not treat that memory as brand new and wipe the interval.

Third, focused study cannot wait on every database round trip. Direct writes were too slow for a smooth review loop, but racing ahead without a reliable persistence model risked duplicated or lost grades.

## Designing The Scheduler

The scheduler adapts SM-2 into three learner-facing grades:

| Grade | Learner signal | Scheduling meaning |
| --- | --- | --- |
| I remember | Confident recall before flipping | Strong pass |
| Got it | Flipped to confirm, but knew it | Normal pass |
| Forgot | Could not recall | Lapse |

That distinction matters because a flip is not always failure. Early versions of flashcard systems often collapse "I checked" and "I forgot" into the same signal, but those are different memory events. In this app, a confident pass earns a longer first gap, a confirmed pass still advances, and a lapse resets the card into relearning.

The server owns schedule calculation through `lib/srs.ts`, while the UI only sends the learner's grade. That keeps client clocks and optimistic UI state from becoming the source of truth. Session building also follows a coverage rule: overdue cards are always shown first, and new cards are introduced oldest-first so older vocabulary cannot be starved by newer imports.

## One Word, Multiple Study Identities

The product needed two kanji-related study surfaces:

| Study mode | Question asked |
| --- | --- |
| Word Kanji | Can I read this full word from the glyphs? |
| Smart / All Kanjis | Can I read this character in this word? |

For example, the same character can take different readings in different words. That meant the app could not model "kanji knowledge" as one global card per character. A card needed to know the source word and the character being tested.

The first implementation treated Smart Kanji cards too much like generated projections of word text. That worked until real study behavior pushed on the model: words change, selected characters change, and regenerated cards can accidentally become "new" cards even when the learner has already built an interval.

The fix was to make Smart Kanji cards durable study objects:

- identity became `(user_id, vocab_id, character)`, not mutable word text;
- deselected cards became inactive instead of deleted;
- reconciliation updated card metadata without touching SRS columns;
- duplicate legacy rows were merged while preserving review history;
- the UI refreshed card data without reshuffling progress mid-session.

That changed the invariant from "regenerate the current projection" to "preserve the learner's memory record and reconcile metadata around it." It stopped the app from confusing an edited word with a new memory.

## Keeping Reviews Fast Without Lying

The hardest reliability problem was the review button itself.

A learner expects grading to feel instant. But a grade also needs to update the schedule, write history, respect row-level ownership, reject stale concurrent state, and avoid applying the same command twice if a retry happens after a lost response.

The first repair moved review persistence into atomic Postgres functions. A schedule update and review-history insert now commit together, and stale reviews are rejected instead of silently overwriting newer state.

The second repair introduced a sequential review outbox:

```text
Learner grades card
        |
        |-- UI advances immediately
        |
        `-- FIFO outbox -> review API -> atomic commit RPC
                              |
                              `-- idempotent client_review_id
```

The UI can move at study speed, while persistence stays ordered. Each queued command carries a `client_review_id`, so retrying a lost response does not double-apply the grade. If saving fails, the failed command stays at the head of the queue until the learner retries.

This design keeps the product honest: optimistic UI does not mean the client invents the truth. It means the interface gives the learner continuity while the database receives an ordered, idempotent handoff.

## Data Model Behind The Interface

```text
auth.users
   |
   `-- vocab
         |-- word SRS columns
         |-- word-level kanji SRS columns
         `-- kanji_cards
               |-- source vocab_id + character identity
               |-- active/inactive reconciliation
               `-- reviews with client_review_id
```

Supabase Row Level Security scopes every user's vocabulary and review data. API routes run as the signed-in user through an RLS-scoped client, so the app can use the publishable key without exposing a service role.

## Making Correctness Repeatable

The project now has tests and documentation around the behaviors most likely to regress:

- scheduler edge cases and grade semantics;
- deck coverage rules;
- Smart Kanji reconciliation;
- selection behavior;
- review outbox ordering and retry behavior.

That mattered because the project evolved through real product corrections: deduplicating added words, preserving study sessions, fixing "Study again" cram behavior, repairing Smart Kanji interval resets, and finally making fast review persistence reliable.

## Outcome

What the repository supports today:

- public account-based Japanese vocab study app;
- private per-user vocabulary through Supabase Auth and RLS;
- SM-2-style spaced repetition with three honest grades;
- independent word, Word Kanji, and Smart / All Kanjis study tracks;
- durable Smart Kanji identity that preserves schedules across edits and deselection;
- atomic review commits with idempotent retry support;
- automated tests and design docs for the learning and reliability rules.

I am intentionally not claiming retention gains, latency percentages, or active-user metrics here. Those would need separate measurement. The strongest verified result is product correctness: the app preserves learner progress while keeping the study loop responsive.

## What I Learned

1. **A flashcard is a promise, not just a row.** Once a card has history, identity becomes product-critical.
2. **The question being asked should shape the data model.** "Read this word" and "read this character in this word" look similar, but they need separate schedules.
3. **Optimistic UI needs a persistence contract.** Fast interactions are only trustworthy when writes are ordered, idempotent, and recoverable.
4. **Tests should encode product guarantees.** The most valuable tests here protect study fairness, schedule preservation, and retry behavior.

## Evidence Notes

| Theme | Evidence |
| --- | --- |
| Auth and per-user data | Commit `f9a1148`, `supabase/0002_auth_rls.sql`, `lib/supabase/*`, `proxy.ts` |
| Spaced repetition | Commit `3409e81`, `lib/srs.ts`, `docs/spaced-repetition.md`, `lib/srs.test.ts` |
| Smart Kanji introduction | Commit `a3cedb3`, `supabase/0004_kanji.sql`, `supabase/0005_kanji_smart.sql` |
| Kanji selection | Commit `cec9cfc`, `supabase/0006_kanji_selection.sql`, `components/KanjiBreakdown.tsx` |
| Lossless reconciliation | Commit `abfa713`, `supabase/0007_kanji_reconciliation.sql`, `lib/kanji-sync.ts`, `lib/kanji-sync.test.ts` |
| Atomic reviews | Commit `abfa713`, `supabase/0008_atomic_reviews.sql` |
| Responsive queued reviews | Commit `ef4720d`, `supabase/0009_review_outbox.sql`, `lib/review-outbox.ts`, `lib/review-outbox.test.ts` |
| Prompt hints | Commit `25948be`, `supabase/0010_kanji_prompt_hints.sql`, `buildWordPromptParts` |

## Portfolio Assets Still Worth Adding

- Live product URL and preferred public project name.
- Screenshots of the flashcard flow, Smart Kanji highlight, kanji selection UI, and retry state.
- A short personal origin paragraph in your voice.
- Optional measured result later, if you instrument review latency or retention.
