# Vocab — Development Case Study Research

Internal research only. Do not publish claims from this document without a claim audit and human confirmation of intent/outcomes.

## 1. Scope And Limitations

| Field | Value |
| --- | --- |
| Repository | `/Users/pavanpatil/Developer/vocab` |
| Remote | `https://github.com/The-Pavan-Patil/vocab.git` |
| Branch analyzed | `main` |
| History window | 2026-06-15 → 2026-07-20 |
| Commits analyzed | 25 (5 merges excluded from rankings) |
| Working tree | clean at collection time (untracked `.codex/hooks.json` later) |
| Authors | Essentially one developer (Pavan Patil / ownpath + personal emails) |
| Evidence map | [`git-evidence.md`](./git-evidence.md) |

**Source strengths:** migrations, design docs (`docs/spaced-repetition.md`, `docs/deck-coverage.md`), unit tests under `lib/*.test.ts`, and multi-layer commits that change schema + API + UI together.

**Source limitations:** no PR discussion history inspected; no production metrics; no user analytics; Beads DB not fully initialized in this workspace; commit messages sometimes bundle unrelated work (e.g. Beads + Kanji in `a3cedb3`).

Evidence labels used below: **Verified** / **Inferred** / **Confirmed** / **Unknown**.

---

## 2. Product And Architecture Timeline

| Date | Commit | Verified change |
| --- | --- | --- |
| 2026-06-15 | `e5e8900` | Create Next App scaffold |
| 2026-06-16 | `ae89923`, `9fa74c8` | Core vocab app: tabs, import/export, Supabase-backed list |
| 2026-06-17 | `f9a1148` | Auth via `@supabase/ssr`, per-user RLS (`0002_auth_rls.sql`) |
| 2026-06-18 | `3409e81` | SM-2 SRS on vocab words (`0003_srs.sql`, `lib/srs.ts`) |
| 2026-06-19–22 | `4b9f56e` … `1316cf6` | Dedup adds; session growth; Study-again cram; Bearer auth hook |
| 2026-06-30 | `a3cedb3` | Word-level Kanji deck + Smart Kanji deck (`0004`/`0005`), furigana, kanjiapi |
| 2026-07-06 | `cec9cfc` | Curated `kanji_selection` per word (`0006`) |
| 2026-07-09 | `c3726b2` | Password reset + site URL handling |
| 2026-07-17 | `abfa713` | Smart Kanji consistency: reconciliation identity, atomic reviews (`0007`/`0008`) |
| 2026-07-20 | `ef4720d` | FIFO review outbox + idempotent `client_review_id` (`0009`) |
| 2026-07-20 | `25948be` | All-Kanjis prompt hints for unselected characters (`0010`) |

**Current stack (Verified):** Next.js 16 App Router / React 19 / Tailwind 4 / Supabase Postgres + Auth / SM-2 in `lib/srs.ts` / kuroshiro + kanjiapi.dev for Smart Kanji.

**Current layers (Verified):**

```
UI (Flashcards, SmartKanjiDeck, forms)
  → client API helpers + SequentialReviewOutbox
  → Next route handlers (RLS-scoped Supabase client)
  → Postgres tables + RPC commit_*_review
```

---

## 3. Current Architecture And Data Model

### Entities (Verified from `supabase/*.sql` + types)

- `vocab` — word rows with dual SRS column sets (word + word-level kanji) and optional `kanji_selection`.
- `kanji` — global reference cache (JLPT, readings) from kanjiapi.dev.
- `kanji_cards` — per-user study cards keyed by `(user_id, vocab_id, character)` with `active` flag and own SRS state.
- `reviews` — append-only grade log with `client_review_id` for idempotent retries.

### Invariants the code now enforces (Verified)

1. **Server owns schedules** — client sends grade (+ practice flag); `lib/srs.ts` runs on the server path.
2. **Card identity is vocab+character**, not mutable word text (`0007`).
3. **Deselection deactivates**, does not delete, so history/schedule can return (`0007` + `lib/kanji-sync.ts`).
4. **Schedule + history commit atomically**; stale concurrent reviews raise conflict (`0008`).
5. **Optimistic UI + ordered persistence** via bounded FIFO outbox; retries reuse the same review UUID (`0009`, `lib/review-outbox.ts`).
6. **Coverage guarantees** encoded in `lib/coverage.test.ts` / `docs/deck-coverage.md` (due never capped; new cards oldest-first; JLPT cumulative).

### Experimental / incomplete (Verified caveats)

- FSRS upgrade path documented but not implemented.
- `reviews` history is written for future stats/FSRS; scheduler does not read it today.
- Bearer token support in `requireUser` exists for “mobile backend support” — **Unknown** whether a mobile client ships.
- Beads issue tracking is integrated in-repo but local DB prefix was missing during this research pass.

---

## 4. Major Issue Packets

### Packet A — Dual study tracks from one word

```text
Issue: Studying meaning and reading required different fronts and schedules for the same vocab row.
User-visible symptom: Learners need word cards (kanji+romaji → English) and kanji cards (bare kanji → reading+meaning) without one review advancing the other.
System constraint: One physical row, two independent forgetting curves.
Root cause: A single SRS column set cannot represent two study modes.
Decision: Parallel kanji_* columns + decks.ts adapter; same schedule() with KANJI_TUNING.
Implementation: 0004_kanji.sql, lib/decks.ts, mode-aware review route, Flashcards reuse.
Why this solved it: Projection keeps one algorithm while isolating state per mode.
Tradeoff: Schema denser; review API must select column set carefully.
Outcome: Word and kanji decks coexist; docs state grading one never moves the other. (Verified in docs + code; adoption Unknown)
Confidence: High on implementation; Unknown on whether learners use both tracks equally.
Open question: Was the word-level Kanji deck retained mainly as a stepping stone to Smart Kanji, or is it still a primary product surface?
```

### Packet B — Smart Kanji identity and lossless reconciliation

```text
Issue: Auto-generated per-character cards broke when words were edited, renamed, or deselected.
User-visible symptom: (Inferred) schedule reset / duplicate cards / lost history when source word text or selection changed.
System constraint: Early identity used (user, character, word text); upserts were “ignoreDuplicates” and only JLPT-graded chars became cards.
Root cause: Mutable word text as identity + hard delete / skip semantics could not survive curation and renames.
Decision: Identity = (user, vocab_id, character); active flag; curated kanji_selection; reconcile desired vs existing.
Implementation: 0006 selection, 0007 migration (backfill vocab_id, merge duplicates, unique index), rewritten lib/kanji-sync.ts, abfa713 UI queue stability.
Why this solved it: Metadata can change without minting a new card; deselection preserves SRS for later reactivation.
Tradeoff: Reconciliation complexity; migration must merge legacy duplicates carefully.
Outcome: Wiped intervals stopped after durable identity + inactive preservation + atomic commits. (Confirmed symptom; Verified implementation)
Confidence: High.
Open question: closed — wiped intervals.
```

### Packet C — Optimistic reviews vs schedule integrity

```text
Issue: Fast flashcard UX conflicted with durable, correct SRS writes.
User-visible symptom: (Inferred from progression) laggy grading if awaited; lost/duplicated grades if fire-and-forget under retries/concurrency.
System constraint: Network latency + possible lost responses + concurrent/stale state.
Root cause: Separate UPDATE + INSERT could diverge; unconstrained optimistic posts could race; retries without idempotency double-apply.
Decision: Atomic RPC commits → then FIFO outbox with client_review_id idempotency.
Implementation: 0008_atomic_reviews.sql (abfa713), then 0009_review_outbox.sql + SequentialReviewOutbox (ef4720d) wired into Flashcards and SmartKanjiDeck.
Why this solved it: UI advances immediately; persistence stays ordered; failed head command retries safely; concurrent stale writes get 409.
Tradeoff: Outbox max depth 8; paused queue needs explicit Retry; more DB RPC surface.
Outcome: Queued persistence keeps focused study responsive; direct slow writes were unsuitable. (Confirmed intent; Verified implementation) Latency unmeasured (Unknown).
Confidence: High.
Open question: closed — slow direct writes / focus friction drove the queue.
```

### Packet D — Coverage and fairness of study queues

```text
Issue: Bounded sessions must not silently drop words or kanji.
User-visible symptom: Docs explicitly call out an old “newest-first starvation” bug.
System constraint: Session size caps vs large libraries; JLPT filtering.
Root cause: List API newest-first ordering leaked into new-card introduction.
Decision: buildSession re-sorts new cards oldest-first; due reviews never capped; JLPT filters cumulative.
Implementation: lib/srs.ts, docs/deck-coverage.md, lib/coverage.test.ts ACs.
Why this solved it: Cap defers, never deletes; every leveled kanji remains reachable.
Tradeoff: Users may need multiple sessions to meet the whole new pile.
Outcome: Executable acceptance tests. (Verified)
Confidence: High.
Open question: Was starvation noticed in personal study, or found while writing the coverage doc/tests?
```

### Packet E — Auth boundary and personal data isolation

```text
Issue: Personal vocab (including Marathi tips) needed private multi-user storage.
User-visible symptom: Login gate; per-user lists; exports scoped to signed-in user.
System constraint: Publishable key only; no service role in the app.
Root cause: Early app likely single-tenant / shared table assumptions before f9a1148.
Decision: Supabase Auth + RLS on user_id; proxy session refresh; optional SITE_URL for reset links.
Implementation: 0002_auth_rls.sql, lib/supabase/*, proxy.ts, login/reset pages.
Why this solved it: Database enforces isolation even if client is compromised to anon key.
Tradeoff: Migration step for existing rows; email confirm / reset URL config footguns documented in README.
Outcome: Auth is required path today. (Verified) Whether other people actually use the app: Unknown.
Confidence: High on mechanism.
Open question: Is this still personal-only, or intended as a multi-user product?
```

### Packet F — Prompt fairness in All Kanjis (secondary)

```text
Issue: Unselected kanji inside a source word could unfairly become part of the tested prompt.
User-visible symptom: Feat 25948be adds furigana hints for turned-off characters in All Kanjis view.
System constraint: Readings may not split safely (jukujikun).
Root cause: Showing the full word without marking known context characters blurs what is being tested.
Decision: word_prompt_parts with reveal-only-when-entire-segment-unselected rule.
Implementation: 0010 + buildWordPromptParts in kanji-sync.ts + SmartKanjiDeck UI.
Why this solved it: Prompt tests selected characters; mixed unsplittable segments stay unhinted rather than guessing.
Tradeoff: Some prompts remain harder when segmentation cannot split.
Outcome: Documented in deck-coverage.md. (Verified) Pedagogy validated? Unknown.
Confidence: Medium-high.
Open question: Did this come from confusing study sessions, or from designing the selection feature completely?
```

---

## 5. Evidence Table

| Claim | Evidence | Label |
| --- | --- | --- |
| App is personal Japanese vocab with Kanji/Romaji/English/Marathi tips/category | README | Verified |
| Auth + RLS isolates vocab per user | `f9a1148`, `0002_auth_rls.sql` | Verified |
| SM-2 with three grades remember/right/wrong | `3409e81`, `lib/srs.ts`, docs | Verified |
| Flip-as-fail was rejected for pedagogical reasons | `docs/spaced-repetition.md` §2 | Verified (design intent in-repo) |
| Smart Kanji cards are kanji-in-word, JLPT-bucketed | `a3cedb3`, `0005`, docs §4b | Verified |
| Selection curation added later | `cec9cfc`, `0006` | Verified |
| Card identity moved to vocab_id+character; inactive preserves history | `abfa713`, `0007`, `kanji-sync.ts` | Verified |
| Reviews became atomic + conflict-checked | `abfa713`, `0008` | Verified |
| Reviews gained FIFO outbox + idempotent client IDs | `ef4720d`, `0009`, `review-outbox.ts` | Verified |
| Unselected kanji can show safe furigana hints | `25948be`, `0010` | Verified |
| Newest-first starvation was a real prior bug | `docs/deck-coverage.md` | Verified as documented history; original buggy commit not isolated in this pass |
| Solo developer ownership | git author emails | Inferred near-certain |
| Used in production by multiple users | — | Unknown |
| Measured retention / latency gains | — | Unknown |

---

## 6. Interview Answers (2026-07-26)

| Topic | Answer | Label |
| --- | --- | --- |
| Product status | Started as a personal Japanese study tool; opened to other learners via auth + per-user lists; deployed publicly | Confirmed |
| Smart Kanji failure (`abfa713`) | Wiped intervals | Confirmed |
| Review outbox (`ef4720d`) | Direct writes were too slow for focused study; inconsistency caused frustration → queued persistence | Confirmed |
| Word Kanji vs Smart / All | Word Kanji = read this word from the glyphs; Smart/All = read this character in this word; Smart adds JLPT buckets; All is ungated review of the same cards | Confirmed |
| Ownership / artifacts | Self-built and researched; no screenshots or study-session anecdotes yet (can create) | Confirmed |
| Memory research | Algorithm informed by memory research (forgetting curve, spacing, testing effect, desirable difficulty — still summarized in `docs/spaced-repetition.md`); original external research sources were lost; implementation assisted by Claude; now covered by tests and treated as stable | Confirmed |

Updated packet notes:

- **Packet B outcome:** wiped intervals → stable identity + inactive cards + atomic commits. (Confirmed symptom)
- **Packet C outcome:** queue exists so focused study is not blocked by slow direct writes. (Confirmed intent)
- **Packet A open question:** closed — both decks remain intentional study modes with different questions.
- **Packet E open question:** closed — personal origin, now public multi-learner deployment.

Still unknown / do not claim: retention metrics, latency numbers, active user counts, attributed tester quotes.

---

## 7. Candidate Case-Study Themes

Strongest connected narrative:

1. **Research-informed scheduling** — three-grade SM-2 encoding classic memory findings; tested and stable even after citation trail was lost.
2. **Two questions about the same writing** — Word Kanji vs Smart/All Kanji.
3. **Wiped intervals forced a better card identity** — vocab+character, inactive preservation, atomic reviews.
4. **Focused study needs queued truth** — optimistic UI + FIFO outbox + idempotent retries.

Supporting: auth for opening a personal tool to other learners; coverage fairness; prompt hints for unselected kanji.

---

## 8. Public Draft

See [`public-draft.md`](./public-draft.md).
