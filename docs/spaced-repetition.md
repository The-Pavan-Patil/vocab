# Spaced Repetition (Flashcards SRS)

How the Flashcards tab decides **which card to show and when**. This document is
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

`due_at = now + interval_days`. Example trajectory of a card answered correctly
each time (ease 2.5): **2d → 6d → 15d → 38d → 94d → …** A `wrong` at any point
resets it to ~daily and lowers the ease.

All tunable constants live at the top of `lib/srs.ts` (`EASE_*`,
`FIRST_INTERVAL`, `SECOND_INTERVAL`, `RELEARN_GAP`, `NEW_CARDS_PER_SESSION`).

### Two timescales of "frequency"

"Show forgotten cards frequently" happens at two levels:

1. **Within a session (minutes).** A `wrong` card is re-inserted `RELEARN_GAP`
   (5) cards later in the live queue, so it's drilled until it sticks this
   sitting. (Handled in the component via `buildSession` + requeue.)
2. **Across days.** `due_at` schedules the real next review.

`buildSession()` builds the queue: every overdue review (most overdue first),
then up to `NEW_CARDS_PER_SESSION` brand-new cards. Cards due in the future are
excluded — that's the "all caught up" state, which shows the time until the next
review via `nextDueAt()`.

---

## 4. Data model & flow

```
components/Flashcards.tsx ──POST /api/vocab/[id]/review { grade } ──▶
  app/api/vocab/[id]/review/route.ts
     ├─ load card SRS state (RLS-scoped)
     ├─ schedule(prev, grade, Date.now())   ← lib/srs.ts (source of truth)
     ├─ UPDATE vocab  SET ease, interval_days, reps, lapses, state, due_at, last_reviewed_at
     └─ INSERT reviews (append-only log)
  ◀── returns updated card
```

- **Scheduler is server-side.** The client only sends a grade and trusts the
  returned card; it never computes intervals. This keeps one source of truth and
  prevents client clock skew from corrupting schedules.
- **Optimistic UI.** The component advances immediately and persists in the
  background for snappiness; a failed save surfaces an inline error (the card's
  server-side schedule is simply unchanged and reappears next load).
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
| `components/Flashcards.tsx`               | Study UI: grading, session queue, recap           |
| `lib/types.ts` → `Vocab`, `Grade`         | SRS fields on the row + grade type                |

---

## 5. To enable it

Run `supabase/0003_srs.sql` once in the Supabase SQL editor (after
`0002_auth_rls.sql`). It's idempotent. Existing cards get the defaults and are
treated as new, so they enter the rotation immediately.

---

## 6. Future enhancements (context for later)

- **Upgrade to FSRS.** Swap the body of `schedule()` for an FSRS implementation
  and train it on the accumulated `reviews` log. The API and UI don't change —
  the scheduler is isolated behind one function. This is the main reason the
  `reviews` table (with `elapsed_days`, interval/ease snapshots) exists now.
- **Per-user settings.** Daily new-card limit (`NEW_CARDS_PER_SESSION`), target
  retention, and learning steps are currently constants — promote to a settings
  table / UI.
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
```
