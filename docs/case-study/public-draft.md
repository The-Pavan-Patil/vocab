# 日本語 Vocab — Building a Study App That Remembers Correctly

**Deck:** A personal Japanese flashcard tool became a public learner app. The hard part was not showing cards — it was keeping schedules truthful while study stayed fast enough to protect focus.

---

## Context

日本語 Vocab started as one learner’s tool for memorizing Japanese vocabulary: each word carries kanji, romaji, English meaning, Marathi tips, and a part-of-speech category. After it proved useful in personal study, it was opened to other learners with accounts and private per-user lists, and deployed publicly.

The product was researched, designed, and built by a single developer. The scheduler encodes well-known findings about how memory works — forgetting curves, spacing, active recall, and desirable difficulty — adapted into a practical three-grade SM-2 model. Some of the original external research notes were lost along the way; what remains is the design record in the repository, a tested implementation, and a stable study loop.

---

## Challenge

The promise sounds simple: show a card, grade yourself, come back later when you are about to forget.

That promise collides with three constraints:

1. **Japanese needs more than one question per word.** Reading a whole word from its glyphs is not the same skill as reading one character inside that word.
2. **Schedules must survive editing.** Turning characters on or off, or changing a source word, must not wipe the intervals a learner has already earned.
3. **Focus is fragile.** Waiting on every network write during a focused session breaks the study rhythm and turns small delays into frustration.

---

## Product Surface

To the learner, the app is a tabbed study workspace:

- add and import vocabulary;
- flashcards with **I remember** / **Got it** / **Forgot**;
- Word Kanji study and Smart / All Kanjis study;
- a searchable list with edit and export.

Grading feels immediate. Behind that surface, each grade is a durable scheduling event that must stay ordered, idempotent, and conflict-safe.

---

## Approach: Encode Memory Science In A Small Scheduler

Rather than inventing a proprietary algorithm from scratch, the app adapts **SM-2** — the same family of spaced-repetition logic long used in tools like Anki — to three honest grades:

| Action | Meaning |
| --- | --- |
| **I remember** (no flip) | Confident recall |
| Flip → **Got it** | Recalled, confirmed |
| Flip → **Forgot** | Lapse |

An early binary model treated every flip as failure. That erased a real distinction: people flip to confirm an answer they knew, and people flip because they forgot. Splitting the flip into Got it / Forgot keeps the learning signal honest.

The net rule stays classical: success lengthens the gap; failure brings the card back soon — both within a session (relearning inserts) and across days (`due_at`). The server owns the schedule so client clocks cannot corrupt intervals. Session building always clears overdue reviews, then introduces new cards oldest-first so a large library cannot starve older words behind newer ones.

**Why this matters for the product story:** the research trait is not a marketing appendix. It is the reason the grading model and queue design exist — to protect the memory effect the learner is there for.

---

## Two Study Questions, Two Decks

The same vocabulary row can answer two different questions:

- **Word Kanji** — “Can I read this word from the glyphs?”
- **Smart / All Kanjis** — “Can I read this character in this word?”

Smart Kanji highlights a single character’s reading in context (for example 食 in 食べる → た, versus 食 in 食事 → しょく). Smart adds JLPT buckets so practice can stay level-scoped; All is the ungated review of those same character-in-word cards.

Each track keeps an independent schedule. Grading a word card must never advance the character card, and the reverse. That product distinction forced a data-model choice: one physical word, multiple study identities.

---

## Architectural Mismatch: Cards Tied To Mutable Word Text

Smart Kanji originally treated generated cards more like disposable projections of word text. That assumed source words were stable and that regenerating cards was harmless.

In practice, intervals were wiped when the projection model could not survive the way learners actually edit vocabulary — selections change, words change, and a card’s earned schedule is the valuable state.

The correction was to treat Smart Kanji cards as durable study objects:

- **Identity** became `(user, source word id, character)`, not mutable word spelling.
- **Deselection deactivates** a card instead of deleting it, so reselecting restores the same schedule.
- **Reconciliation** updates metadata in place and merges legacy duplicates without inventing a fresh forgetting curve.
- **Live sessions** refresh card data without reshuffling progress mid-study.

The learner still toggles “study as kanji” and picks characters. Underneath, the system stopped confusing “the word string changed” with “this is a new memory to schedule.”

---

## Hardest Reliability Problem: Speed Without Lying

Focused study cannot pause on every database round-trip. Direct writes were too slow for that rhythm; the inconsistency — sometimes waiting, sometimes racing ahead — was itself frustrating.

The first repair made review commits **atomic**: schedule update and history insert happen together, and a stale concurrent review is rejected instead of silently overwriting a newer one.

The second repair separated **what the learner feels** from **how persistence runs**:

- the UI advances immediately;
- a bounded FIFO outbox sends reviews strictly one at a time;
- each command carries a client review id so a lost response can be retried without applying the grade twice;
- a failure pauses the queue and keeps the failed command until Retry.

The interface stays in flow. The database stays the source of truth. The outbox is the boundary that makes both possible.

```
Learner grades card
        │
        ├─► UI advances now
        │
        └─► FIFO outbox ─► review API ─► atomic commit RPC
                              │
                              └─ idempotent on client review id
```

---

## Data Model Behind The Interface

```
vocab (word + dual schedules)
   │
   ├── word flashcards / Word Kanji track
   │
   └── kanji_cards (character-in-word, active flag, own SRS)
            │
            └── reviews (append-only history + client_review_id)
```

Auth and Row Level Security keep each learner’s list private after the app moved from a personal tool to a public multi-user deployment. The publishable client key never needs a service role; isolation lives in the database policies.

---

## How Correctness Became Repeatable

The repository’s design docs and unit tests encode the guarantees the product depends on: coverage rules for sessions, reconciliation behavior for Smart Kanji, outbox ordering and retry semantics, and scheduler edge cases. That test surface is how the algorithm remains “stable to use” after the original research notes were lost — the behavior is pinned in code, not only in memory of a chat session.

---

## Outcome

What the evidence supports today:

- A public learner app with private per-user vocabulary lists.
- Research-informed spaced repetition with a three-grade model and documented rationale.
- Distinct Word Kanji and Smart / All Kanjis study modes.
- Lossless Smart Kanji identity that stopped wiped intervals.
- Optimistic, queued review persistence suitable for focused sessions.
- Automated tests around coverage, sync, and the review outbox.

What is not claimed here: retention-rate improvements, latency benchmarks, or active-user metrics. Screenshots and study-session anecdotes are planned editorial assets, not yet available.

---

## Learnings

1. **Memory science has to survive product friction.** If grading is slow or schedules wipe on edit, the spacing effect never gets a fair chance.
2. **Name the question the card asks.** “Read this word” and “read this character in this word” look similar in a UI and are different systems underneath.
3. **Durable identity beats disposable regeneration** whenever the schedule is the learner’s progress.
4. **Queue the truth.** Optimistic UI is not “ignore the server” — it is an ordered, idempotent handoff so focus and correctness can coexist.

---

## Role

Sole builder: product framing, memory-informed scheduler design, data model, review reliability, Smart Kanji study modes, auth for multi-learner access, and the test/documentation record that keeps the system stable.

AI assistance was used while implementing and refining the scheduler; the shipped behavior is owned, documented, and tested in the repository.

---

## Evidence Used For This Draft

| Theme | Anchors |
| --- | --- |
| Personal → public auth | Commit `f9a1148`, `supabase/0002_auth_rls.sql`, developer confirmation |
| Scheduler + science framing | Commit `3409e81`, `lib/srs.ts`, `docs/spaced-repetition.md` |
| Smart Kanji introduction | Commit `a3cedb3`, `0004`/`0005` |
| Selection curation | Commit `cec9cfc`, `0006` |
| Wiped intervals → reconciliation + atomic reviews | Commit `abfa713`, `0007`/`0008`, developer confirmation |
| Focused study → review outbox | Commit `ef4720d`, `0009`, `lib/review-outbox.ts`, developer confirmation |
| Prompt hints for unselected kanji | Commit `25948be`, `0010` |
| Deck intent | Developer confirmation (Word vs Smart/All) |

Internal research packets: [`research.md`](./research.md).

---

## Editor Notes

Still needed before a polished public page:

- [ ] Product URL / deployment name for the live app
- [ ] Screenshots: grading UI, Smart Kanji highlight, JLPT filter, retry/outbox state
- [ ] Optional short study-session anecdote (personal origin story is approved)
- [ ] Permission check on any third-party marks (kanjiapi.dev, Supabase) if used in marketing layout
- [ ] Decide whether to restore a short “Sources” footnote from `docs/spaced-repetition.md` (Ebbinghaus, spacing effect, testing effect, Bjork) even though the fuller research trail was lost
- [ ] Do not invent metrics; if later measured, add a dated Outcomes subsection
- [ ] Attribution line: sole developer, Pavan Patil (confirm preferred public name/link)
