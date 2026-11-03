# Spaced Repetition (Flashcards SRS)

How the four study decks (Vocab, Word Kanji, Smart Kanji, All Kanji) decide
**which card to show and when**. This document is
the design record: the *why* behind the algorithm and the grading model, plus
the upgrade path, so future changes have full context.

> TL;DR — Each card carries SM-2 scheduling state. A successful review pushes the
> next review further out; a lapse pulls it back in close. The UI produces three
> grades (`remember` / `right` / `wrong`); the server is the single source of
> truth for the next interval.

---

## 1. The science it encodes

Four findings drive every serious flashcard scheduler:

- **Forgetting curve (Ebbinghaus, 1885).** Recall probability decays roughly
  exponentially with time since the last review. The goal is to review *just
  before* it drops too low.
- **Spacing effect.** The same reviews spread out beat the same reviews massed
  together (cramming). Each successful review should earn a *longer* gap.
- **Testing effect (active recall).** *Attempting* to recall strengthens memory
  more than re-reading. The flip-to-reveal moment is the learning event — the
  reveal is just feedback.
- **Desirable difficulty (Bjork).** A successful recall strengthens memory most
  when it was hard — i.e. when reviewed right as you were about to forget. So
  each success lengthens the next gap; each lapse resets it short.

**Net rule:** remember a card → its gap grows. Forget it → it comes back
frequently until it sticks again.

---

## 2. The grading model (and the refinement)

The original concept was binary: a **Remember** button = pass; flipping the card
to see the answer = fail. The problem: people flip for *two* different reasons —
to *confirm* an answer they actually knew, and because they genuinely *forgot*.
Treating every flip as a failure throws away that distinction and under-counts
real knowledge.

So we split the flip outcome into two, giving **three grades**:

| Grade        | UI action                                              | Meaning              | ≈ SM-2 quality |
| ------------ | ------------------------------------------------------ | -------------------- | -------------- |
| `remember`   | **“I remember”** on the front, *without flipping*      | confident recall     | q5 (strong)    |
| `right`      | Flip → **“Got it”**                                    | recalled, just checked | q4 (normal)  |
| `wrong`      | Flip → **“Forgot”**                                    | a lapse              | q2 (fail)      |

`remember` and `right` are both passes; the difference is only how much they
nudge the ease factor (a confident recall schedules slightly more aggressively).
`wrong` is the only failure.

> Keyboard: front → `Space`/`Enter` flips, `R` = Remember. Flipped → `←`/`1` =
> Forgot, `→`/`2` = Got it, `Space` flips back. `H` toggles the Marathi hint.

---

## 3. The algorithm — SM-2 adapted for three grades

We use **SM-2** (the SuperMemo 2 algorithm, also the long-time basis of Anki),
collapsed from its 0–5 quality scale to our three grades. It was chosen over the
alternatives deliberately:

- **Leitner boxes** — simplest, but fixed gaps, no per-card personalization.
- **SM-2** *(chosen)* — per-card ease factor, ~1 file of pure code, maps cleanly
  to pass/fail-ish grades.
- **FSRS** (modern, Anki's current default) — more accurate, but it's built to
  exploit *graded* ratings and ideally needs a history of your reviews to train
  its parameters. With a near-binary signal and no history on day one, most of
  its advantage is unused. See §6 for the upgrade path.

### Per-card state

Stored as columns on the `vocab` row (see `supabase/0003_srs.sql`), mirrored by
`SrsState` in [`lib/srs.ts`](../lib/srs.ts):

| Field              | Meaning                                                        |
| ------------------ | ------------------------------------------------------------- |
| `ease`             | interval multiplier; starts `2.5`, clamped to `[1.3, 2.7]`    |
| `interval_days`    | current gap between reviews                                   |
| `reps`             | consecutive successes (`0` = new or just lapsed)              |
| `lapses`           | lifetime count of `wrong` answers                             |
| `state`            | `new` → `review` ↔ `relearning`                               |
| `due_at`           | when it's next due; `NULL` = never reviewed (= due now)       |
| `last_reviewed_at` | timestamp of the previous review                              |

### Scheduling logic (`schedule()` in `lib/srs.ts`)

On a **pass** (`remember` / `right`):

```
reps += 1
interval = reps === 1 ? FIRST_INTERVAL[grade]   // remember → 2 days, right → 1 day
         : reps === 2 ? 6 days
         : round(interval * ease)                // compounds → exponential gaps
ease += { remember: +0.10, right: 0.0 }          // clamped to [1.3, 2.7]
```

On a **lapse** (`wrong`):

```
reps = 0; lapses += 1
ease -= 0.20                                      // future gaps grow more slowly
interval = 0                                      // due immediately → reappears today
```

`due_at = now + interval_days`. A card answered **Got it** each time follows
**1d → 6d → 15d → 38d → 95d → …** at ease 2.5; a confident **I remember**
starts at 2 days and also raises ease. A `wrong` at any point resets it to
immediate relearning and lowers the ease.

Intervals are capped before calculating `due_at`: 36,500 days for Vocab cards and
18,250 days for the three kanji decks. This keeps long-lived schedules within a
usable date range instead of eventually producing invalid timestamps.

Each deck's interval constants are its own entry in `DECK_TUNING`
(`lib/decks.ts`) — four separate objects, so retuning one deck never moves
another. The session constants (`RELEARN_GAP`, `NEW_CARDS_PER_SESSION`,
`SESSION_SIZE_OPTIONS`) live at the top of `lib/srs.ts`.

### Two timescales of "frequency"

"Show forgotten cards frequently" happens at two levels:

1. **Within a session (minutes).** A `wrong` card is re-inserted `RELEARN_GAP`
   (5) cards later in the live queue, so it's drilled until it sticks this
   sitting. (Handled by `hooks/use-study-session.ts`, shared by every deck.)
2. **Across days.** `due_at` schedules the real next review.

`buildSession()` builds the queue: every overdue review (most overdue first),
then up to `newLimit` brand-new cards, **oldest-added first** (so words you added
long ago aren't starved behind ones you just added — `GET /api/vocab` returns
newest-first, so the builder re-sorts new cards by `created_at` ascending).
`newLimit` defaults to `NEW_CARDS_PER_SESSION` (100) and is user-selectable (see
below). Cards due in the future are excluded — that's the "all caught up" state,
which shows the time until the next review via `nextDueAt()`.

**Study again (cram) is practice-only.** "All caught up" is the *default* state,
not a lockout. The **"Study again"** button (and the restart control) call
`buildSession()` with `cram: true`, which drops the due-date filter and
re-includes every reviewed card right now — so you can run the deck again
immediately instead of waiting for the schedule.

Grading a crammed card that is **not yet due** is recorded in the `reviews` log
but does **not** move its schedule (`due_at` / `interval` / `ease` are left
untouched). This is deliberate: reviewing a card early is no evidence it should
wait *longer*, and letting early reps compound would inflate intervals (e.g.
38d → 95d after a single early review). The client tags such reps
`practice: true`, but the server decides by its own clock alone: any review of
a card that `isEarly()` says isn't due is a practice rep, flag or not (see
`app/api/vocab/[id]/review/route.ts`). That also covers a card shown from stale
data — reviewed on another device since this one loaded — whose client still
thinks it's due. A crammed card that is genuinely **due/overdue** still
schedules normally — cram never *blocks* a real review.

**Session size is configurable.** The new-card cap applies to **new** cards only
(overdue reviews are never capped — you should always clear what you've already
learned). A selector beside the category picker chooses the batch size —
**20 / 50 / 100 / All** (`SESSION_SIZE_OPTIONS`) — defaulting to
`NEW_CARDS_PER_SESSION` (100) and persisted per browser and per deck in
`localStorage` (`vocab:sessionSize:word`, `vocab:sessionSize:kanji`,
`kanji:sessionSize`, `kanji:all:sessionSize`; "All" = no cap). It stays a *soft*
cap: every deck surfaces an
**"Add N more"** action mid-session and a **"Study N more"** button on the
completion screen, both of which append the next (oldest-added) batch of new
cards to the live queue without resetting the running tally.

---

## 4. Data model & flow

```
components/decks/VocabDeck.tsx ── hooks/use-study-session.ts ──FIFO outbox──▶
  POST /api/vocab/[id]/review { reviewId, grade, practice, mode } ──▶
  app/api/vocab/[id]/review/route.ts
     ├─ load card SRS state (RLS-scoped)
     ├─ if isEarly (server clock): keep the schedule unchanged
     ├─ else schedule(prev, grade, now, DECK_TUNING[deck])  ← lib/srs.ts (source of truth)
     └─ RPC commit_vocab_review
          ├─ lock + reject stale concurrent reviews
          ├─ UPDATE the selected schedule
          └─ INSERT reviews in the same transaction
  ◀── returns updated card
```

- **Scheduler is server-side.** The client only sends a grade and trusts the
  returned card; it never computes intervals. This keeps one source of truth and
  prevents client clock skew from corrupting schedules.
- **Optimistic, recoverable UI.** The component advances immediately while a
  bounded FIFO outbox persists reviews strictly one at a time. A failure pauses
  the queue without discarding the failed command; **Retry** sends that command
  again with the same idempotency key before continuing.
- **Atomic persistence.** Migration `0008_atomic_reviews.sql` commits the schedule
  and history together. Concurrent requests based on stale state return `409`
  instead of overwriting a newer review.
- **Idempotent retries.** Migration `0009_review_outbox.sql` gives each client
  command a per-user unique `client_review_id`. A lost response can therefore be
  retried safely without applying the grade or appending history twice.
- **`reviews` table.** Append-only log of every grade with interval/ease
  snapshots and `elapsed_days`. Not read by the scheduler today — it exists so a
  future FSRS upgrade and stats views have the history they need.

### Files

| File                                      | Role                                              |
| ----------------------------------------- | ------------------------------------------------- |
| `lib/srs.ts`                              | Pure, isomorphic scheduler + session builder      |
| `supabase/0003_srs.sql`                   | SRS columns on `vocab` + `reviews` table + RLS    |
| `app/api/vocab/[id]/review/route.ts`      | Records a review, persists the new schedule       |
| `lib/api.ts` → `reviewVocab()`            | Client fetch helper                               |
| `lib/review-outbox.ts`                    | Bounded sequential persistence queue              |
| `hooks/use-study-session.ts`              | Shared mechanics: queue, grading, saves, keyboard |
| `components/decks/*Deck.tsx`              | One file per deck: its cards, queue, settings     |
| `components/study/*`                      | Shared study UI: card, grade buttons, end screen  |
| `lib/types.ts` → `Vocab`, `Grade`         | SRS fields on the row + grade type                |
| `lib/decks.ts`                            | Deck registry: each deck's columns + tuning       |
| `supabase/0004_kanji.sql`                 | `study_as_kanji` + `kanji_*` cols + `reviews.mode`|
| `supabase/0008_atomic_reviews.sql`        | Transactional schedule + history commit RPCs      |
| `supabase/0009_review_outbox.sql`         | Idempotent IDs for safe review retries            |

---

## 4a. The Word Kanji deck — one word, two cards

The **Flashcards** section holds two decks over the same words, each with its
**own independent schedule**:

- **Vocab**: front shows the kanji **and** the reading (romaji); you recall the
  English. Uses the base SRS columns + `DECK_TUNING.vocab`.
- **Word Kanji**: front shows **only the kanji**; flipping reveals the reading
  **and** the meaning. Uses the parallel `kanji_*` columns +
  `DECK_TUNING["word-kanji"]`.

A word opts in via the **`study_as_kanji`** flag — a "Also study as Kanji"
toggle on the Add form, the Dictionary add dialog, the List-tab edit row, and a
batch toggle on Import. A toggled word then appears in **both** decks; grading it
in one never moves the other's schedule.

**Same algorithm, per-deck tuning.** Every deck calls the *same* `schedule()`;
only its own constants differ. The kanji decks start deliberately more
conservative (1 day after reveal-and-confirm, 2 days after confident recall, a
4-day second step, and ease ceiling 2.6) because recalling a reading + meaning
from the bare glyph is harder, so kanji come back sooner and their gaps grow more
slowly. Each deck's tuning is a separate object, so it can be changed alone.

**How the code is split.** `lib/decks.ts` is the registry between a deck and its
columns: `readSrs`/`writeSrs` map a deck's columns to/from the base SRS field
names, and `projectCard(row, deck)` *projects* a row so the generic
`buildSession`/`isDue`/`isEarly`/`nextDueAt` helpers read that deck's schedule
**unchanged**. Each deck is its own component (`components/decks/`) owning its
cards, queue rules, settings and faces; they share the study UI
(`components/study/`) and the mechanics hook (`hooks/use-study-session.ts`).
The review route takes a `mode`, picks the column set + tuning, and stamps
`reviews.mode`. Category and session size are remembered per deck.

---

## 4b. The Smart Kanji section — kanji-in-word decks

The **Smart Kanji** section holds two decks driven by the **same**
`study_as_kanji` toggle. Their study item is a single kanji **in the context of
one word**, testing that kanji's reading there: 食/食べる→た and 食/食事→しょく
are two separate cards, grouped under 食.

- **Smart Kanji** filters by an **active JLPT level**. The level is
  **cumulative** — selecting N4 includes N5 + N4 (every level that easy or
  easier) — plus an **All** option. Uses the card's base SRS columns, with
  furigana under the word's kanji you don't study in any word.
- **All Kanji** studies every card, newest word first with each kanji's words
  grouped (`buildAllKanjiQueue`), with furigana under the word's kanji you
  don't study in any word.
  It has its **own independent schedule** — the card's `all_*` columns
  (`0012_all_kanji_schedule.sql`), logged as `kanji_all` — so grading a card
  here never moves its Smart Kanji due date. It started fresh: every card was
  new to it.

```
add 食べる (toggle on) ──▶ POST /api/kanji-cards/sync
  ├─ extract kanji (食) ──▶ getKanji() ── kanjiapi.dev /v1/kanji + /v1/words ──▶ `kanji` cache (jlpt, readings, example words)
  ├─ segment(食べる) ── kuroshiro furigana ──▶ 食 = た
  └─ reconcile kanji_cards { vocab_id, character:食, word:食べる, reading:た, … }

Smart Kanji ─ JLPT selector (cumulative N5…N1 + All) ─ buildSession(cards.filter(jlpt>=level)) ─ schedule(DECK_TUNING["smart-kanji"])
All Kanji   ─ projectCard(card, "all-kanji") ─ buildAllKanjiQueue(cards) ─ schedule(DECK_TUNING["all-kanji"])
```

- **Data.** `kanji` (global reference cache from kanjiapi.dev: readings, `jlpt`,
  example words) + `kanji_cards` (per-user; base-named SRS columns so `lib/srs.ts`
  schedules them directly; `jlpt` denormalized for the level filter). `reviews`
  gains `kanji_card_id` and the `kanji_char` mode. See `supabase/0005_kanji_smart.sql`.
- **Reading-in-word** comes from `lib/furigana.ts` (kuroshiro furigana), parsed by
  `parseFuriganaHtml`. kuroshiro keeps a kanji compound as one run (上手=じょうず),
  so `splitCompoundSegments` divides it per kanji when the reading lines up with
  the kanji's kanjiapi on/kun readings in exactly one way, allowing rendaku
  (本棚 = ほん + だな) and gemination (学校 = がっ + こう): 上手 → 上=じょう, 手=ず.
  Best-effort: jukujikun (今日=きょう, 大人=おとな) stay an unsplit run, so
  no wrong per-character reading is invented — the card falls back to the word
  reading.
- **Selection is explicit when curated.** The picker defaults JLPT-graded kanji
  on and ungraded kanji off. Once the user saves an array, exactly those kanji
  become active cards; explicitly selected ungraded kanji are allowed and appear
  under **All levels**. In both decks, ordered `word_prompt_parts` show
  furigana under segments made entirely from turned-off kanji, while selected
  kanji remain unhinted — whatever JLPT level Smart Kanji is filtered to, the
  toggle alone decides. A kanji turned on in ANY word is never hinted: the
  front drops the hint for every character with an active card
  (`hideStudiedReadings`), so studying 上 through 上手 also hides it in 上着. Mixed unsplittable segments remain unhinted rather than
  displaying a guessed partial reading. Parts are written at sync time, so a
  word synced before the compound split keeps its old parts until it is edited
  or a full sync (`POST /api/kanji-cards/sync`) runs.
- **Population is automatic + lossless.** `lib/kanji-sync.ts` reconciles after
  create/edit/toggle/import operations. Opening a deck no longer runs a full
  reconciliation (it made the decks slow to open); a failed sync's warning toast
  offers **Retry**, which runs the full one (`POST /api/kanji-cards/sync`).
  Card identity is `(user, vocab_id, character)`, so word/meaning/reading metadata
  can change without resetting SRS state. Deselected cards become inactive rather
  than being deleted; reselecting restores the same schedule.
- **Loaded once.** The section fetches the cards once (`hooks/use-kanji-cards.ts`)
  and both decks share them; `GET /api/kanji-cards` also returns the cached
  details of every kanji in the cards' words, so a card's back needs no request
  per kanji. It refetches only after a word change that can touch the cards, a
  deck-wide sync, or the app's return-to-view refresh.
- **Live sessions are stable.** Server refreshes replace card data inside the
  current queue without rebuilding its order, progress, or forgotten-card repeats.
  Outside a cram pass, a queued card that fresh data says is no longer due
  (reviewed on another device) leaves the queue; a run under way is never
  restarted by a refresh, even when cards were added or removed elsewhere.
- **kanjiapi.dev** (no key, KANJIDIC2/JMdict) also replaces Jisho for the
  dictionary's per-kanji breakdown. `lib/kanjiapi.ts` normalizes it; the `kanji`
  table caches it. The existing word-level kanji deck (§4a) is untouched — the one
  toggle feeds both.

### Files (smart deck)

| File | Role |
| ---- | ---- |
| `supabase/0005_kanji_smart.sql` | `kanji` cache + `kanji_cards` + `reviews.kanji_card_id` |
| `supabase/0006_kanji_selection.sql` | Per-word curated character arrays |
| `supabase/0007_kanji_reconciliation.sql` | Stable card identity + inactive-card history preservation |
| `supabase/0008_atomic_reviews.sql` | Atomic Smart Kanji review commits |
| `supabase/0009_review_outbox.sql` | Idempotent review commands and safe retries |
| `supabase/0010_kanji_prompt_hints.sql` | Safe furigana prompt metadata for turned-off kanji |
| `supabase/0011_vocab_sentence.sql` | Per-word example sentence, copied onto cards |
| `supabase/0012_all_kanji_schedule.sql` | All Kanji's independent `all_*` schedule + `kanji_all` mode |
| `supabase/0013_rls_initplan.sql` | RLS policies evaluate `auth.uid()` once per query |
| `lib/kanjiapi.ts` | kanjiapi.dev fetch + normalize + DB cache |
| `lib/furigana.ts` | kuroshiro furigana → per-kanji reading |
| `lib/kanji-sync.ts` | Desired selections ↔ active/inactive `kanji_cards` reconciliation |
| `app/api/kanji/[char]/route.ts` | cached kanji lookup |
| `app/api/kanji-cards/{route,sync,[id]/review}.ts` | list · reconcile · review |
| `hooks/use-kanji-cards.ts` | the section's one fetch of cards + kanji details |
| `components/SmartKanjiSection.tsx` | the section: Smart Kanji / All Kanji |
| `components/decks/{SmartKanji,AllKanji}Deck.tsx` | each deck's queue, schedule, settings |

---

## 5. To enable it

After `0002_auth_rls.sql`, run `0003_srs.sql` through
`0013_rls_initplan.sql` in numeric order. Existing cards keep their schedules;
`0007` consolidates any legacy rename duplicates by keeping the most recently
reviewed/mature schedule and reattaching the merged review history. Words remain outside Kanji decks until
`study_as_kanji` is enabled.

---

## 6. Future enhancements (context for later)

- **Upgrade to FSRS.** Swap the body of `schedule()` for an FSRS implementation
  and train it on the accumulated `reviews` log. The API and UI don't change —
  the scheduler is isolated behind one function. This is the main reason the
  `reviews` table (with `elapsed_days`, interval/ease snapshots) exists now.
- **Per-user settings.** The new-card batch size is now a per-browser selector
  (`localStorage`, one key per deck); target retention and learning steps are
  still constants. A server-side settings table would sync these across devices.
- **Stats view.** Retention %, streaks, and "cards maturing" all derive from the
  `reviews` log.
- **Reverse / typed review.** Today recall is JP → EN with self-grading. Could
  add EN → JP, or typed answers (which give an objective grade instead of
  self-report).
- **Server-built due queue.** The queue is built client-side from the full list
  (fine at personal scale). At larger scale, add `GET /api/vocab/due` to page
  the due set on the server.
- **Leech handling.** Cards with many `lapses` could be flagged/suspended for
  reformulation (the `lapses` counter is already tracked).
