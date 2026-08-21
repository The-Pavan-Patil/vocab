# Mainichi koto (毎日こと) — Master Research Document

Internal research document. Created 2026-08-02 and updated 2026-08-03 with the Product Case Study MasterDoc Builder workflow. This is the evidence-backed source of truth for later public case-study drafts; it is not public copy.

Evidence labels:

- **Verified:** directly supported by a repository artifact, Git history, test, build, or current product artifact.
- **Inferred:** likely from multiple source signals but not confirmed by a person or artifact.
- **Confirmed:** supplied by Pavan Patil in the 2026-07-26 interview recorded in `docs/case-study/research.md` or the 2026-08-03 follow-up in this Codex task.
- **Unknown:** not safe to publish as fact.

## Project Snapshot

| Field | Current understanding | Confidence / source |
| --- | --- | --- |
| Project name | Mainichi koto (毎日こと); the deployed interface still displays the legacy name “日本語 Vocab” | Confirmed public name; Verified live branding mismatch on 2026-08-03 |
| Client/company | Self-initiated product; no client named | Confirmed: 2026-07-26 interview |
| Dates | 2026-06-15 to at least 2026-07-28 | Verified: Git history |
| Team / role | Pavan Patil was the sole builder across product framing, design, implementation, testing, and documentation | Confirmed: 2026-07-26 interview; Git authorship supports but does not independently prove sole ownership |
| Output type | Responsive web application | Verified: Next.js application and build routes |
| Current status | Publicly deployed at <https://vocab-xi-one.vercel.app>; the unauthenticated production login screen was independently opened on 2026-08-03 | Confirmed URL and Verified deployment/login surface; signed-in revision remains Unknown |
| Primary audience | Initially Pavan as a Japanese learner; later opened to other learners through accounts and private lists | Confirmed: 2026-07-26 interview |
| Public / internal outputs | Internal master research document plus a dated public case-study draft | Skill workflow |
| Existing drafts | `docs/case-study/research.md`, `git-evidence.md`, `public-draft.md`, and `portfolio-case-study.md` | Verified; preserved unchanged |
| Publication restrictions | Do not publish metrics, adoption, client approval, or production scale without evidence. Do not expose personal data from `DL Services Acknowledgement.pdf` or personal vocabulary in screenshots. Pavan Patil and the live product URL may be named publicly. | Verified privacy risk; attribution and URL Confirmed |

## Source Audit

| Source | What it proves | What it suggests | What it cannot establish |
| --- | --- | --- | --- |
| Current repository on `main` at `9ada2bd` | Product structure, stack, routes, UI components, data model, algorithms, integrations, and latest code state | A sustained solo product-development effort across UI, data, and reliability | Real-world adoption, current deployment state, or user outcomes |
| Git history, 2026-06-15 to 2026-07-28 | Sequence of product capabilities and repair work; exact commits for auth, SRS, decks, reconciliation, outbox, prompt hints, and July 28 UI refinement | Problems were discovered through use and then converted into explicit invariants | Why every change was prioritized unless confirmed elsewhere |
| `README.md` | Product definition, main features, stack, setup, auth/RLS design, import/export formats | The product is intended to be usable beyond a prototype | Live URL, launch date, or usage numbers |
| `docs/spaced-repetition.md` | Scheduler rationale, grade semantics, alternatives considered, queue rules, practice behavior, and future FSRS path | Learning science directly shaped product behavior | External research trail, measured learning effect, or retention improvement |
| `docs/deck-coverage.md` | Explicit coverage guarantees and acceptance criteria | Fairness and reachability became first-class product rules | Whether starvation was first observed in real study or found during verification |
| `lib/*.test.ts` | Executable behavior for scheduling, deck projection, furigana, selection, reconciliation, API normalization, outbox ordering, and coverage | Reliability work is repeatable rather than anecdotal | Production integration, latency, or human learning outcomes |
| Supabase migrations `0002`–`0010` | RLS, independent schedules, Smart Kanji entities, stable identity, inactive preservation, atomic review RPCs, idempotency, and prompt metadata | The data model evolved in response to product constraints | Whether every migration is active in the current public deployment |
| UI components and API routes | Learner-facing flows and the client-to-server review path | The visible simplicity is supported by explicit reliability boundaries | Visual quality in a signed-in production session during this pass |
| `.beads/interactions.jsonl` | Historical completion notes, build/test evidence, and repeated manual-verification caveats | Work was tracked as product issues rather than only commits | Original issue descriptions for all IDs; several entries only record closure |
| Existing case-study files | Prior evidence synthesis and 2026-07-26 human confirmations | The project already had a strong reliability-focused narrative | Current truth after July 20 without a new repository pass |
| 2026-08-03 interview answers | Public name, live URL, product origin, word-first learning rationale, Smart Kanji answer rationale, algorithm-testing discovery, qualitative outcome, sole ownership, and free-access intent | The strongest public story starts with the learning model rather than the architecture | Independent learner validation or measured impact |
| Live product at `vocab-xi-one.vercel.app` | The Vercel deployment responds and redirects unauthenticated visitors to a functioning login/create-account surface | The account boundary described by the repository is deployed | Signed-in study flows, current migration state, or exact deployed commit |
| [Official Anki manual](https://docs.ankiweb.net/editing.html) and [India App Store listing](https://apps.apple.com/in/app/ankimobile-flashcards/id373493387) | Anki desktop is free/open-source; AnkiMobile is a paid iOS companion; Anki supports custom fields, note types, decks, and templates | The honest competitive motivation is mobile price plus setup/general-purpose friction, not inability to add custom content | Pavan’s subjective experience or direct product-market comparison |
| [MEXT handbook](https://www.mext.go.jp/a_menu/nihongo_kyoiku/kyoiku/handbook/pdf/en_zensho.pdf) and [Japan Foundation course](https://www.jpf.go.jp/e/kansai/news/2025/03/post-12057.html) | Japanese children study kanji and combination words; official learning material connects kanji, vocabulary, sentences, readings, and meanings | A word/context-oriented learning model is defensible | The claim that Japanese children “do not learn kanji,” which should not be published |
| Local verification on 2026-08-02 | `node --test lib/*.test.ts` passed 72/72; ESLint passed; `next build` passed and registered all expected routes | Current source is internally coherent and buildable | Signed-in behavior, production integrations, or deployment |
| Local browser attempt at `http://localhost:3001` | The checkout requires Supabase URL/key at runtime | Missing local configuration, not necessarily a product defect | Any authenticated product screen; no visual claims should rely on this attempt |
| `DL Services Acknowledgement.pdf` | Nothing relevant to the product case study | None; it is an unrelated personal document | It must not be used as public case-study evidence; it contains sensitive personal information |
| Existing service on `localhost:3000` | Nothing relevant to Vocab; it was a separate portfolio application | A future public case study may be published into that portfolio | It does not verify Vocab itself |

## Product Context

- **What the product is:** A Japanese vocabulary and kanji study web app that combines personal word capture, dictionary lookup, structured import/export, and spaced-repetition review. **Verified:** `README.md`, routes, components.
- **Who it is for:** Initially the builder’s own Japanese study practice, later other account-based learners. **Confirmed:** 2026-07-26 interview.
- **Core user job:** Turn personally meaningful vocabulary—kanji, romaji, English meaning, Marathi tips, and category—into repeatable recall practice without losing progress. **Verified** for the data and study surface; “without losing progress” is supported by the later reliability fixes.
- **Existing product context:** The app grew from a compact personal tool into an authenticated multi-user system with private data, imports, exports, and multiple study identities. **Verified** for the sequence; **Confirmed** for the personal-to-public intent.
- **Why this project started:** While learning Japanese, Pavan encountered an intensive traditional routine through his girlfriend: write and recite ten kanji a day and revise them daily, a method she used to learn roughly 2,000 characters. He found the routine exhausting and researched alternatives. The useful product insight was to make whole words the primary unit while retaining character-level detail for exam-oriented study. **Confirmed** as the personal origin; the broader education framing is supported by official sources only as “kanji plus combination words,” not “children do not learn kanji.”
- **Market / environment:** Self-directed Japanese learning. Anki was the closest reference product. AnkiMobile’s India price felt high to Pavan as a student, and general-purpose flashcard configuration did not provide the guided word/kanji/JLPT/Marathi-hint workflow he wanted out of the box. **Confirmed** as Pavan’s experience; official sources verify that Anki is customizable and that desktop Anki is free, so public copy must not call Anki generally paid or restrictive.

## User Problem

- **Before state:** A demanding write-and-recite routine—ten kanji a day plus daily revision—showed Pavan how quickly isolated-character study could become exhausting. Existing tools could store flashcards, but he wanted a ready-made Japanese workflow for his own words, Marathi memory tricks, word readings, JLPT groupings, and several recall modes. **Confirmed** personal context; no comparative usability study was conducted.
- **User-visible friction addressed:**
  - A learner needs to distinguish confident recall, answer checking, and forgetting. **Verified:** three-grade design record.
  - Whole-word reading and character-in-word reading are related but different study questions. **Confirmed:** 2026-07-26 interview; implemented as independent schedules.
  - Edits or selection changes must not erase earned intervals. **Confirmed** symptom: intervals were wiped; **Verified** repair.
  - Network persistence must not interrupt focused grading. **Confirmed** symptom: direct writes felt too slow; **Verified** outbox design.
  - Bounded sessions must defer cards fairly rather than lose or starve them. **Verified** product rule and tests; the starvation issue was **Confirmed** as discovered while testing the algorithm.
- **Learning-model tension:** Whole words support practical reading and visual association between characters, while individual kanji readings still matter for exams. The product needed both without forcing either into the other’s schedule. **Confirmed:** 2026-08-03 answer.
- **Business / creator pain:** Opening the app to other learners required authentication, per-user isolation, and deployment-safe password reset behavior. **Confirmed** intent and **Verified** implementation.
- **Access goal:** Keep the product free for learners rather than reproduce the mobile cost barrier Pavan felt as a student. **Confirmed.** No business model is documented.
- **Main use cases:** Add/search/edit vocabulary; dictionary-assisted entry; structured import; private storage; word flashcards; Word Kanji; Smart Kanji by cumulative JLPT level; All Kanjis contextual review; cram/review-again; PDF/DOCX export. **Verified.**

## Challenge

- **Product promise:** Show an appropriate card, capture an honest self-grade, and preserve the learner’s memory history while the interaction remains fast. **Inferred** synthesis from confirmed motivations and verified implementation.
- **Technical constraints:** One vocabulary source supports multiple independent schedules; Supabase RLS scopes every user; card metadata changes without redefining memory identity; network requests can be slow or retried; external kanji/furigana data can be ambiguous or temporarily unavailable. **Verified.**
- **Design constraints:** The interface must explain multiple study modes, surface the tested character clearly, keep grading quick, and fit expanding answer content into a fixed card area. **Verified** in UI; intent partly **Inferred**.
- **Platform constraints:** Next.js App Router, client/server boundaries, Supabase auth cookies, and a browser-held study queue. **Verified.**
- **What made the work non-obvious:** The valuable state is not the word row but the learner’s schedule for a specific question. Optimistic speed is only trustworthy when persistence remains ordered, atomic, conflict-aware, and idempotent. **Inferred** synthesis strongly supported by the code evolution.

## Key Flows And Product Surfaces

### 1. Vocabulary capture and organization

- **User goal:** Build a personal study list with the fields that support recall.
- **Surface:** Add form, dictionary search/details, searchable table, edit/delete, and multi-format import.
- **After state:** A signed-in learner owns RLS-scoped vocabulary rows and can export only their own list.
- **Product decision:** Support CSV, Excel, Word, and PDF import with an editable preview rather than blind insertion. **Verified.**
- **Design decision:** Keep capture, search, study, list, and import as tabs in one workspace. **Verified** implementation; rationale **Unknown**.
- **Evidence:** `README.md`, `app/page.tsx`, `components/AddVocabForm.tsx`, `DictionarySearch.tsx`, `ImportPanel.tsx`, `VocabTable.tsx`, API routes.
- **Confidence:** High for implementation; low for outcome.

### 2. Word flashcard review

- **User goal:** Recall English meaning from a Japanese word and reading.
- **Surface:** Front-side “I remember,” flip, then “Got it” or “Forgot”; keyboard controls; Marathi hint; due-first sessions; configurable new-card batch; Study again.
- **Product decision:** A flip is not automatically failure. Confident recall and checked recall are separate positive signals.
- **Development decision:** The server owns scheduling; early cram practice records history without inflating the schedule.
- **Evidence:** `docs/spaced-repetition.md`, `lib/srs.ts`, `components/Flashcards.tsx`, review route, tests.
- **Confidence:** Verified.

### 3. Word Kanji review

- **User goal:** Read the full word from bare glyphs, then reveal reading and meaning.
- **Product decision:** Reuse the scheduler and UI through a deck projection, while storing an independent `kanji_*` schedule on the same word row.
- **Tradeoff:** Denser schema and mode-aware persistence in exchange for independent forgetting curves without duplicating the entire vocabulary entity.
- **Evidence:** `supabase/0004_kanji.sql`, `lib/decks.ts`, `Flashcards.tsx`, tests.
- **Confidence:** Verified; continuing product importance Confirmed.

### 4. Smart Kanji / All Kanjis review

- **User goal:** Recall one character’s reading inside a specific source word.
- **Surface:** Target character highlighted in the word; Smart view filters cumulatively by JLPT level and due state; All view groups the same character’s examples and removes the level/due gate.
- **Product decision:** Model cards as `(user_id, vocab_id, character)`, because the same character can take different readings in different words.
- **Data behavior:** Explicit selection can include ungraded kanji; deselection makes cards inactive rather than deleting them; safe furigana hints appear only for fully unselected segments.
- **July 28 refinement:** The flipped card now shows the whole word reading, romaji, word meaning, and compact reading/meaning rows for every kanji in the word. The whole-word view supports visual association between characters; per-kanji readings remain useful for exam-oriented recall. Data is fetched lazily and failures fall back to loading/empty states. **Verified** implementation; rationale **Confirmed** on 2026-08-03.
- **Evidence:** commits `a3cedb3`, `cec9cfc`, `abfa713`, `25948be`, `9ada2bd`; migrations `0005`–`0010`; `SmartKanjiDeck.tsx`; `kanji-sync.ts`; `furigana.ts`; tests.
- **Confidence:** High for behavior; low for the July 28 intent and observed effect.

### 5. Review persistence and recovery

- **User goal:** Move through cards without waiting, while keeping grades safe.
- **Flow:** Grade → UI advances → bounded FIFO outbox → review API → atomic Postgres RPC → updated card returns.
- **Product effect:** The interface stays responsive while writes remain sequential; failures pause at the head and Retry reuses the same command.
- **Evidence:** `lib/review-outbox.ts`, `hooks/use-review-outbox.ts`, review routes, migrations `0008` and `0009`, tests, 2026-07-26 confirmation.
- **Confidence:** Verified for the mechanism; Confirmed that direct writes caused focus friction; unmeasured performance effect remains Unknown.

## Product Decisions

### Honest three-grade self-assessment

- **Problem addressed:** A binary “remember vs flipped” model misclassified checking as forgetting.
- **Alternative considered:** Treat every reveal as a fail.
- **Choice:** “I remember,” “Got it,” and “Forgot,” mapped to a compact SM-2 quality model.
- **Tradeoff:** More learner judgment and UI states, but a more faithful learning signal.
- **Effect:** Different first intervals and ease changes; only Forgot is a lapse.
- **Evidence / confidence:** Verified in design docs, code, and tests.

### Separate study identities for separate questions

- **Problem addressed:** Whole-word reading and character-in-word reading should not advance each other.
- **Alternative considered:** One schedule per vocabulary row or one global card per character.
- **Choice:** Independent word, word-kanji, and character-in-word schedules.
- **Tradeoff:** More schema and reconciliation complexity.
- **Effect:** A learner can practice related skills without cross-contaminating progress.
- **Evidence / confidence:** Verified; product intent Confirmed.

### Deactivate rather than delete study history

- **Problem addressed:** Editing and selection changes wiped intervals.
- **Alternative:** Regenerate cards from mutable word text.
- **Choice:** Durable vocab+character identity, active flag, in-place reconciliation, and duplicate migration.
- **Tradeoff:** More migration and sync logic; inactive rows remain stored.
- **Effect:** Reselecting a character restores its schedule.
- **Evidence / confidence:** Verified repair; symptom and observed stop Confirmed.

### Fair bounded sessions

- **Problem addressed:** Large libraries and newest-first API ordering could bury older new cards.
- **Choice:** All overdue reviews first; new cards oldest-first; cap only new cards; “All” and “Add more” remain available.
- **Tradeoff:** A learner may need several sessions to introduce the entire new-card pool.
- **Effect:** Tests prove deferral instead of loss and full reachability.
- **Evidence / confidence:** Verified behavior; Pavan Confirmed on 2026-08-03 that the starvation issue was discovered while testing the algorithm.

### Practice without schedule inflation

- **Problem addressed:** Reviewing a not-yet-due card in cram mode is not evidence for a longer next interval.
- **Choice:** Record early practice but preserve the current schedule.
- **Tradeoff:** History includes practice events that the current scheduler does not consume.
- **Evidence / confidence:** Verified.

## Design Decisions

### Keep the question visually explicit

- **Behavior:** Smart Kanji highlights the target character within its source word and asks for that character’s reading “here.”
- **Principle:** Context matters, but the tested unit must remain clear.
- **Implementation:** `WordWithFocus` and safe per-segment reading hints.
- **System impact:** UI depends on reconciled character-in-word identity and prompt-part metadata.
- **Confidence:** Verified implementation; design rationale Inferred from the prompt and prior confirmation.

### Use cumulative JLPT filters

- **Behavior:** Selecting N4 includes N5 and N4; All includes ungraded cards.
- **Principle:** A learner studying a harder level should not lose access to easier material.
- **Implementation:** `matchesLevel`, `levelLabel`, and coverage tests.
- **Confidence:** Verified.

### Expand the answer into a compact whole-word reference

- **Behavior:** July 28 changes added full reading, generated romaji, word meaning, and rows for every kanji’s compact readings and meanings; the details area scrolls inside the card.
- **Principle:** Use visual links between characters to reinforce the whole word, while keeping character-specific readings available for exam preparation. **Confirmed.**
- **Tradeoff:** More network enrichment and visual density on the back of the card.
- **Outcome:** The same answer surface can support practical reading and focused character revision without creating another deck.
- **Evidence:** commit `9ada2bd`, `components/SmartKanjiDeck.tsx`.

## Development Decisions

### Server-owned scheduling

- **Requirement:** One trusted schedule regardless of device clocks or optimistic UI.
- **Implementation:** API routes load current RLS-scoped state, call `schedule()`, then persist through RPC.
- **Tradeoff:** Reviews depend on the server, so responsiveness needs a queue.
- **Evidence / confidence:** Verified.

### Atomic, conflict-aware review commits

- **Requirement:** Schedule and append-only history must agree.
- **Implementation:** Postgres functions lock/check state, update the schedule, and insert history in one transaction; stale requests return conflict.
- **Tradeoff:** More database function surface and migrations.
- **Evidence / confidence:** Verified.

### FIFO outbox with idempotent commands

- **Requirement:** Fast UI plus safe retries after slow or lost responses.
- **Implementation:** Bounded sequential queue; stable UUID per review; failed head retained; database uniqueness per user.
- **Tradeoff:** Backpressure at eight pending commands and an explicit retry state.
- **Evidence / confidence:** Verified; motivating frustration Confirmed.

### RLS as the tenant boundary

- **Requirement:** Open accounts without a server-side service-role key in the app.
- **Implementation:** Supabase Auth, `user_id` foreign keys, row policies, per-request server client, session-refresh proxy.
- **Tradeoff:** Migration and redirect configuration are operational dependencies.
- **Evidence / confidence:** Verified; personal-to-public intent Confirmed.

### Treat external language data as best effort

- **Requirement:** Enrich kanji without inventing incorrect per-character readings.
- **Implementation:** kanjiapi.dev cache, kuroshiro segmentation, unsplit jukujikun fallback, transient failure behavior that leaves prior reading metadata untouched.
- **Tradeoff:** Some ambiguous segments remain unhinted and the flipped card may briefly show loading text.
- **Evidence / confidence:** Verified.

## Timeline

| Period | Milestone | Evidence | Confidence |
| --- | --- | --- | --- |
| 2026-06-15 | Create Next App scaffold | `e5e8900` | Verified |
| 2026-06-16 | Core vocabulary workspace, import/export, tabs, Supabase-backed list | `ae89923`, `9fa74c8` | Verified |
| 2026-06-17 | Accounts and per-user RLS | `f9a1148`, migration `0002` | Verified |
| 2026-06-18 | Three-grade SM-2 scheduling | `3409e81`, migration `0003` | Verified |
| 2026-06-19–22 | Deduplication, session preservation/growth, cram repair, bearer auth hook | commits `4b9f56e` through `1316cf6` | Verified |
| 2026-06-30 | Word Kanji and Smart Kanji foundations | `a3cedb3`, migrations `0004`–`0005` | Verified |
| 2026-07-06 | Explicit kanji selection and All Kanjis | `cec9cfc`, migration `0006` | Verified |
| 2026-07-09 | Deployment-safe password reset URL handling | `c3726b2` | Verified |
| 2026-07-17 | Durable Smart Kanji identity, lossless reconciliation, atomic reviews | `abfa713`, migrations `0007`–`0008` | Verified |
| 2026-07-20 | FIFO/idempotent review outbox and safe prompt hints | `ef4720d`, `25948be`, migrations `0009`–`0010` | Verified |
| 2026-07-26 | Developer interview confirmed intent, failure symptoms, and public status | `docs/case-study/research.md` | Confirmed |
| 2026-07-28 | Smart Kanji answer enrichment, card layout refinement, icon-only Import navigation; initial case-study files added | `9ada2bd` | Verified behavior; answer-card rationale Confirmed |
| 2026-08-02 | Fresh research pass; 72 tests, ESLint, and production build pass | local commands in this research session | Verified source quality, not production status |
| 2026-08-03 | Product-name, origin, learning rationale, qualitative outcome, and ownership confirmations; public URL verified to the login surface | user interview and live browser inspection | Confirmed / Verified as noted |

## Visual Asset Inventory

| Asset | Source | Shows | Public use | Caption idea | Confidence |
| --- | --- | --- | --- | --- | --- |
| Word flashcard front/back | Not yet captured | Three-grade recall flow and Marathi hint | Needed | “One reveal, two honest outcomes: checked recall or forgotten.” | Unknown availability |
| Word Kanji vs Smart Kanji comparison | Not yet captured | Two questions derived from one word | High-value | “The same word creates independent whole-word and character-in-context practice.” | Unknown availability |
| Smart Kanji front | Not yet captured | Target character highlighted inside its source word | High-value | “Practice the reading this character takes here.” | Unknown availability |
| July 28 Smart Kanji answer | Not yet captured | Whole-word reading, romaji, meaning, and per-kanji reference rows | High-value | “Use the full word for visual association; keep each character’s reading close for exam study.” | Rationale Confirmed; asset missing |
| Kanji selection UI | Not yet captured | Explicit character inclusion and JLPT defaults | Useful | “Learners choose exactly which characters become study cards.” | Unknown availability |
| Review retry/error state | Not yet captured; may require a staged failure | Recoverable optimistic persistence | Useful technical proof | “A failed save pauses the queue without discarding the grade.” | Unknown availability |
| Architecture diagram | Can be created from verified code | UI → FIFO outbox → API → atomic RPC | Public-safe if simplified | “Study speed at the interface; ordered truth at the database.” | Verified source available |
| Git timeline / migration strip | Can be created from history | Progressive product corrections | Supporting | “Each reliability fix became a durable product invariant.” | Verified source available |
| Existing product screenshots/video | None found in repository | — | Missing | — | Verified absence in tracked files |
| `DL Services Acknowledgement.pdf` | Repository root | Unrelated personal data | Never use | None | Verified exclusion |

## Outcomes And Validation

- **Implemented capability:** Account-based Japanese vocabulary study with add/search/edit/delete, import/export, three-grade spaced repetition, Word Kanji, Smart Kanji, All Kanjis, cumulative JLPT filtering, explicit character selection, and private per-user data. **Verified.**
- **Reliability outcome:** Stable character-in-word identity, inactive preservation, atomic review commits, conflict detection, and idempotent retries. **Verified** in code/migrations/tests.
- **Observed product outcome:** Wiped intervals stopped after the durable identity and commit repairs. **Confirmed** by the 2026-07-26 interview; no dated production log or metric was supplied.
- **Observed experience outcome:** Direct writes were too slow for focused study; queued persistence was introduced to remove that friction. **Confirmed** motivation; no latency benchmark exists.
- **Verification:** 72 unit/acceptance tests passed on 2026-08-02, ESLint passed, and the Next.js production build passed. **Verified.**
- **Launch milestone:** The app was described as publicly deployed on 2026-07-26. **Confirmed.**
- **Live deployment:** <https://vocab-xi-one.vercel.app> responded and showed the account login/create flow on 2026-08-03. **Verified** to the unauthenticated boundary; signed-in study screens were not independently inspected.
- **Design/development reuse:** The same scheduler and session helpers serve multiple decks through adapters/tuning; tests encode shared guarantees. **Verified.**
- **Measured result:** No retention, latency, active-user, conversion, or adoption metrics found. **Unknown; do not claim.**
- **Qualitative outcome:** Pavan reports that the product became “very useful” when he began reading books. He also emphasized that the benefit is gradual and depends on practice and patience rather than producing an instant result. **Confirmed** self-report; not an independent or measured learning outcome.

## Evidence Table

| Claim | Source | What it proves | Confidence | Public-safe? |
| --- | --- | --- | --- | --- |
| The product stores kanji, romaji, English meaning, Marathi tips, and category | `README.md`, types, UI | Current data model and UI | Verified | Yes |
| Accounts isolate each learner’s data | `0002_auth_rls.sql`, Supabase helpers, auth routes | Database and request boundary | Verified | Yes |
| The scheduler has three grades and server-owned interval calculation | `docs/spaced-repetition.md`, `lib/srs.ts`, review routes, tests | Behavior and rationale | Verified | Yes |
| Word and Word Kanji schedules are independent | `0004_kanji.sql`, `lib/decks.ts`, tests | Separate state and projection | Verified | Yes |
| Smart Kanji tests a character in a specific word | `0005`, `kanji-sync.ts`, `SmartKanjiDeck.tsx` | Card identity and UI | Verified | Yes |
| Card identity moved to `(user, vocab, character)` and deselection preserves history | `0007`, `kanji-sync.ts`, tests | Durable identity and reconciliation | Verified | Yes |
| The prior model wiped intervals | 2026-07-26 interview | Human-reported symptom | Confirmed | Yes, if Pavan approves wording |
| Reviews commit atomically and reject stale state | `0008`, routes, tests | Transaction semantics | Verified | Yes |
| Review commands are queued and idempotent | `0009`, outbox code/tests | Ordered retry-safe persistence | Verified | Yes |
| Direct review writes disrupted focus | 2026-07-26 interview | Human-reported motivation | Confirmed | Yes, if Pavan approves wording |
| Session caps do not drop cards | `deck-coverage.md`, coverage tests | Algorithmic guarantee | Verified | Yes |
| July 28 answer cards show whole-word and per-kanji reference content | `9ada2bd`, `SmartKanjiDeck.tsx`, 2026-08-03 interview | Current UI behavior and learning rationale | Verified / Confirmed | Yes |
| All 72 current tests pass; lint/build pass | 2026-08-02 local verification | Current source quality | Verified | Yes, if dated and framed as repository verification |
| The app is publicly deployed | 2026-08-03 live inspection and interview | Login/create-account surface at supplied Vercel URL | Verified / Confirmed | Yes |
| Multiple learners actively use it | No source | Nothing | Unknown | No |
| The product improves retention | No measurement | Nothing | Unknown | No |
| The outbox reduced latency by a stated percentage | No benchmark | Nothing | Unknown | No |
| Pavan was the sole builder from idea to product | 2026-07-26 and 2026-08-03 interviews plus Git authorship | Human confirmation and supporting history | Confirmed | Yes |
| Mainichi koto is free for learners | 2026-08-03 interview; open signup visible at live URL | Intent and accessible account-creation surface | Confirmed / Verified | Yes, but avoid implying a permanent pricing guarantee |
| The product helped Pavan when reading books | 2026-08-03 interview | First-person qualitative outcome | Confirmed | Yes when attributed to Pavan and not generalized |

## Interview Resolution And Remaining Unknowns

The seven evidence-specific questions were answered on 2026-08-03:

1. **Resolved:** Public name is Mainichi koto (毎日こと); live URL is <https://vocab-xi-one.vercel.app>. The live interface still shows the legacy “日本語 Vocab” branding.
2. **Resolved:** The origin is a personal Japanese-learning problem: an exhausting ten-kanji-per-day write/recite/revise routine, plus a desire for personal words, Marathi memory tricks, JLPT groupings, and multiple study modes.
3. **Resolved:** The expanded Smart Kanji answer connects characters visually to the whole word while keeping character-specific readings available for exam study.
4. **Excluded:** The icon-only Import change is irrelevant to the public narrative.
5. **Resolved:** The newest-first starvation issue was discovered while testing the algorithm.
6. **Resolved with limits:** Pavan found the app useful when he started reading books, but describes the result as gradual and practice-dependent. No independent feedback or metrics exist.
7. **Resolved:** Pavan Patil may be named as the sole builder from idea to product. The public URL may be used. Signed-in screenshots remain uncaptured and should use a clean demo account rather than personal vocabulary.

Remaining editor unknowns:

- Whether the deployed signed-in app exactly matches commit `9ada2bd`.
- Whether the live product will be rebranded from “日本語 Vocab” to “Mainichi koto” before publication.
- Whether a clean demo account and approved screenshots will be supplied.
- No active-user, retention, latency, or conversion metrics.

## Candidate Public Narratives

### Angle 1 — Learning kanji through the words you actually read

- **Why it is compelling:** Begins with a personal learning problem and explains why one word needs whole-word, character-in-context, and spaced-review surfaces.
- **Strongest evidence:** Confirmed origin story, verified deck behavior, official support for learning kanji with combination words, and the deployed product.
- **Weakest gap:** Signed-in visuals and independent learner outcomes are missing.
- **Best visuals:** Word deck vs Smart Kanji comparison, Smart Kanji answer, and a small study-model diagram.

### Angle 2 — One word, three learning questions

- **Why it is compelling:** Product-led explanation of why apparently similar cards require distinct identities and schedules.
- **Strongest evidence:** Word, Word Kanji, and character-in-word implementations plus developer confirmation.
- **Weakest gap:** Need clear screenshots and a compact example word set.
- **Best visuals:** Side-by-side fronts/backs using 食べる and 食事; simple data-model map.

### Angle 3 — Protecting focus without compromising truth

- **Why it is compelling:** Turns a familiar optimistic-UI pattern into a concrete learning-product reliability story.
- **Strongest evidence:** Confirmed direct-write friction, FIFO outbox, atomic RPCs, idempotency tests.
- **Weakest gap:** No latency measurement or filmed failure/retry flow.
- **Best visuals:** Review sequence diagram and retry-state screenshot.

### Angle 4 — From personal vocabulary notebook to private multi-user study system

- **Why it is compelling:** Clear 0→1 evolution covering capture, auth, import/export, and study modes.
- **Strongest evidence:** Git timeline, RLS migration, full route surface.
- **Weakest gap:** The original workflow, launch URL, and adoption remain undocumented.
- **Best visuals:** Product timeline, main workspace, import preview, signed-in account view.

## Recommended Narrative

Lead with **Angle 1**: Pavan rejected an exhausting isolated-character routine and built a free tool centered on words learners want to read. Use Angles 2 and 3 as the connected product and reliability decisions. This now has a stronger human reason for existing while keeping every outcome evidence-safe.

## Drafting Gate

Cleared on 2026-08-03. Create the dated public case-study draft from this master document. Preserve editor notes for the branding mismatch, signed-in screenshots, demo data, deployment revision, and absent metrics.
