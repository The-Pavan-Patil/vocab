# Learning kanji through the words you actually read

**Mainichi koto turns a learner’s own vocabulary into several kinds of recall practice—whole words, kanji in context, and spaced review—without losing the progress each card has earned.**

## Project Metadata

| Field | Detail |
| --- | --- |
| Product | Mainichi koto (毎日こと) |
| Date | June–July 2026 |
| Location | India |
| Services | Product research, learning-system design, UX, full-stack development, testing, deployment |
| Role | Sole builder, from idea to product |
| Builder | Pavan Patil |
| Status | Publicly deployed |
| Live product | [vocab-xi-one.vercel.app](https://vocab-xi-one.vercel.app) |

## The Context

Mainichi koto began with a study routine that sounded difficult to sustain.

While I was learning Japanese, my girlfriend described the traditional method she had used to learn roughly 2,000 kanji: write and recite ten characters a day, then revise them daily. It worked for her, but even describing the routine felt exhausting.

That made me question the unit I was trying to memorize. A kanji does not have one fixed reading in every situation; its reading becomes meaningful inside a word. Research also showed me a more useful framing: Japanese education connects kanji with their combination words, and modern learning materials place characters alongside vocabulary, readings, meanings, and sentences.

The insight was not to ignore individual kanji. It was to make the word the center of everyday study, then keep character-level detail available when a learner needs it—especially for exam preparation.

Existing flashcard tools were the closest reference point. Anki is powerful and flexible, but the price of AnkiMobile felt high to me as a student, and setting up a general-purpose system still left me assembling the exact Japanese workflow I wanted: my own words, Marathi memory tricks, JLPT groupings, contextual kanji readings, and several kinds of practice.

So I built that workflow and kept it free for learners.

[Visual: Mainichi koto’s signed-in workspace showing Add, study, Kanji, Smart Kanji, List, and Import surfaces]

## The Challenge

The product promise was simple:

> Help learners remember the Japanese words they want to read, while bringing each card back often enough to build durable recall.

Delivering that promise created four connected problems.

First, one word can create several legitimate questions. “What does this word mean?”, “Can I read the full word from its glyphs?”, and “What reading does this character take here?” are related, but they are not the same memory.

Second, practical reading and exam study need different levels of detail. The whole word supports visual association between characters; per-kanji readings and meanings help a learner inspect the parts.

Third, a learner’s schedule is valuable progress. Editing a source word or changing which kanji to study should not turn a mature card back into a new one.

Finally, focused study cannot pause for every database request. Grading needed to feel immediate without making persistence unreliable.

## The Approach

> I made the word the source of truth, derived several study identities from it, and gave each identity its own durable review schedule.

That model let the interface stay approachable while the system handled the differences underneath.

## Decision 1 — Start with words, then reveal the kanji inside them

Mainichi koto stores vocabulary the way I use it: kanji, romaji, English meaning, Marathi tips, and category. Learners can add their own words, search the built-in dictionary, or import an existing list.

The primary word deck keeps the learning target practical: recognize the word and recall its meaning. A separate Word Kanji deck removes the reading from the front, asking the learner to read the complete written form.

Smart Kanji goes one level deeper. It highlights one character inside a source word and asks what reading that character takes there. That distinction matters because the same kanji can behave differently across words—for example, 食 in 食べる and 食 in 食事.

The answer side reconnects the parts:

- the complete word reading and romaji;
- the word meaning;
- compact readings and meanings for every kanji in the word.

This supports two learning modes at once. The full word creates a visual link between characters, while the per-kanji reference remains useful for focused or exam-oriented revision.

[Visual: the same source word shown as a Word card, Word Kanji card, and Smart Kanji card]

[Visual: Smart Kanji answer showing the full reading, romaji, meaning, and per-character reference rows]

## Decision 2 — Treat each question as a different memory

The same vocabulary entry powers three study identities:

| Study mode | Question |
| --- | --- |
| Word | Do I know what this Japanese word means? |
| Word Kanji | Can I read this complete word from its glyphs? |
| Smart / All Kanjis | What reading does this character take in this word? |

Each identity keeps an independent schedule. Grading a word card never advances the character card, and recognizing one character inside one word does not imply that the learner knows every reading of that character.

Smart Kanji can be filtered cumulatively by JLPT level. All Kanjis removes the level gate and groups examples of the same character together. Learners can also choose exactly which characters in a word should become cards, including ungraded kanji.

This was a product decision before it was a database decision: the question being asked defines the memory being scheduled.

## Decision 3 — Turn self-grading into an honest learning signal

The first grading idea was binary: remembering without flipping was a pass; revealing the answer was a fail.

That model was too blunt. Learners flip for two different reasons: sometimes they forgot, and sometimes they knew the answer but wanted to confirm it.

Mainichi koto therefore uses three signals:

| Action | Meaning | Schedule effect |
| --- | --- | --- |
| **I remember** | Confident recall without revealing | Strong pass |
| **Got it** | Recalled, then checked the answer | Normal pass |
| **Forgot** | Could not recall | Return to relearning |

These signals feed a compact SM-2-style spaced-repetition scheduler. Successful reviews lengthen the gap; a lapse brings the card back soon. Inside a session, forgotten cards are reinserted after a short gap. Across days, the server calculates the next due date.

Session rules protect coverage as the vocabulary list grows: overdue reviews are never capped, while new cards enter oldest-first. That fairness rule came from testing the algorithm, where a newest-first queue could otherwise keep older cards buried.

[Visual: three grading actions mapped to the next review interval]

## Decision 4 — Preserve the learner’s progress and the study rhythm

The earliest Smart Kanji model treated generated cards too much like disposable projections of word text. When source words or selected characters changed, intervals could be wiped.

The repair was to make a character-in-word card a durable study object:

- identity became the learner, source word, and character—not mutable word text;
- deselection made a card inactive instead of deleting it;
- reconciliation updated readings and meanings without replacing the schedule;
- duplicate legacy cards were merged while preserving the most useful history.

That protected progress, but review speed still mattered. Waiting for every database round trip interrupted the rhythm of a focused session.

I separated what the learner feels from how the review is committed:

```text
Learner grades a card
        |
        |-- UI advances immediately
        |
        `-- FIFO review queue
               |
               `-- API -> atomic database commit
                          |
                          `-- idempotent review ID
```

The interface advances immediately. A bounded queue sends review commands one at a time. The database updates the schedule and history together, rejects stale state, and uses a stable review ID so a lost response can be retried without applying the grade twice.

If saving fails, the command remains at the front of the queue until Retry. Optimistic UI does not replace the source of truth; it creates an ordered handoff to it.

[Visual: review pipeline from instant UI response to ordered, atomic persistence]

## Method

I researched memory and recall models, translated the learning problem into several card identities, and developed the product end to end.

The application uses Next.js, React, TypeScript, Tailwind CSS, and Supabase Auth/Postgres. Row Level Security keeps each learner’s vocabulary private. Kanji metadata comes from kanjiapi.dev, while kuroshiro helps derive readings in words without inventing partial readings for ambiguous compounds.

AI assistance supported parts of implementation and scheduler refinement. I owned the product decisions, architecture, final behavior, tests, and documentation.

The behaviors most likely to regress became executable guarantees: scheduler edge cases, deck coverage, character selection, card reconciliation, reading parsing, queue ordering, retry safety, and idempotency. As of August 2, 2026, the repository passes 72 tests, ESLint, and a production build.

## Outcomes

- **A working public product:** Mainichi koto is deployed at [vocab-xi-one.vercel.app](https://vocab-xi-one.vercel.app) with account creation and private per-user data.
- **A learning model built around real reading:** Learners can study a word as meaning, as a complete written form, or as a character in context without mixing their schedules.
- **Progress that survives editing:** Durable card identity and inactive preservation stopped Smart Kanji intervals from being wiped when words or selections changed.
- **Focused review without waiting on each write:** The interface advances immediately while an ordered, retry-safe pipeline commits grades.
- **A qualitative personal result:** The app became especially useful to me when I started reading books. That benefit was gradual—it came through practice and patience, not an instant transformation.
- **A repeatable quality baseline:** Seventy-two automated tests, linting, and the production build verify the current repository behavior.

There are no retention percentages, active-user figures, or latency benchmarks yet. This case study does not claim them.

## Closing

Mainichi koto began as a refusal to treat learning 2,000 characters like a daily copying quota.

The product replaces that single routine with connected ways to practise: learn the word you want to read, inspect the kanji inside it when needed, and let spaced repetition decide when it should return.

The most important engineering decisions follow the same principle. Each question gets an honest identity. Each grade becomes a durable event. And the learner’s progress survives long enough for practice and patience to do their work.

---

## Internal Editor Notes — Remove Before Publication

- [ ] Rebrand the live login/app metadata from “日本語 Vocab” to “Mainichi koto,” or explain that Mainichi koto is the new public name.
- [ ] Capture signed-in screenshots with a clean demo account. Do not expose personal vocabulary, emails, or identifiers.
- [ ] Capture the Word, Word Kanji, Smart Kanji front/back, selection, and retry/error states listed above.
- [ ] Confirm whether the deployed signed-in product matches commit `9ada2bd`.
- [ ] Keep the Anki comparison precise: desktop Anki is free/open-source and supports extensive customization; Pavan’s friction was AnkiMobile’s student cost and the setup required for this Japanese-specific workflow.
- [ ] Keep the education claim precise: Japanese children do study kanji explicitly and also study combination words. Do not publish “Japanese children do not learn kanji.”
- [ ] Treat “useful when reading books” as Pavan’s first-person qualitative result, not proof of retention improvement.
- [ ] Do not add adoption, retention, or performance numbers without dated source evidence.
- [ ] Remove `DL Services Acknowledgement.pdf` from the public repository/history before widely sharing repository links; it is unrelated and contains personal information.

## Internal Evidence Notes

| Narrative | Evidence |
| --- | --- |
| Product origin, public name, free-access intent, Smart Kanji rationale, book-reading outcome, sole ownership | Pavan Patil interviews, 2026-07-26 and 2026-08-03 |
| Live product | <https://vocab-xi-one.vercel.app>, verified to the login/create-account surface on 2026-08-03 |
| Anki capability and pricing nuance | [Anki Manual: Adding/Editing](https://docs.ankiweb.net/editing.html), [AnkiMobile India App Store](https://apps.apple.com/in/app/ankimobile-flashcards/id373493387) |
| Kanji plus combination-word education framing | [MEXT handbook](https://www.mext.go.jp/a_menu/nihongo_kyoiku/kyoiku/handbook/pdf/en_zensho.pdf), [Japan Foundation Kanji A2 course](https://www.jpf.go.jp/e/kansai/news/2025/03/post-12057.html) |
| Word and Kanji study modes | `README.md`, `docs/spaced-repetition.md`, `lib/decks.ts`, `components/Flashcards.tsx`, `components/SmartKanjiDeck.tsx` |
| Spaced repetition and three-grade model | commit `3409e81`, `lib/srs.ts`, `lib/srs.test.ts`, `docs/spaced-repetition.md` |
| Smart Kanji identity and interval preservation | commit `abfa713`, migrations `0007` and `0008`, `lib/kanji-sync.ts`, reconciliation tests |
| Review speed and integrity | commit `ef4720d`, migration `0009`, `lib/review-outbox.ts`, outbox tests |
| July 28 answer design | commit `9ada2bd`, `components/SmartKanjiDeck.tsx`, 2026-08-03 interview |
| Current verification | 72 tests, ESLint, and `next build` passed on 2026-08-02 |
