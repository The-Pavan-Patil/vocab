# Deck coverage — does the app show *every* word and kanji?

Short answer: **yes — nothing in your list is dropped.** A study session shows a
*bounded* batch so it stays short, but everything you haven't studied yet is
**deferred to the next session, not deleted**. This doc explains the selection
algorithm with worked examples, and lists the exact acceptance criteria the
tests in [`lib/coverage.test.ts`](../lib/coverage.test.ts) check.

---

## 1. The word decks (Vocab + the word-level Kanji deck)

Both run through `buildSession()` in [`lib/srs.ts`](../lib/srs.ts). Given your
cards and "now", it returns the ordered queue for this sitting:

1. **Every overdue review**, most-overdue first. **Reviews are never capped** —
   you always clear what you've already learned.
2. **Then new (never-studied) cards, oldest-added first**, up to the session-size
   cap (`20 / 50 / 100 / All`, default 100).
3. **Cards due in the future are excluded** — that's the "all caught up" state.
   They are *deferred*, not lost: they return automatically when due, and **Study
   again** (cram) surfaces them immediately.

The size cap only limits **new** cards, and only **per session**. It controls the
batch size, not a ceiling on your deck.

### Worked example — 25 new words, size = 20

```
List: w1 … w25 (added in that order), none studied yet, size = 20

Session 1  → w1 … w20         (oldest 20 new cards)
   study them → each gets a future due date, leaving the "new" pool
Session 2  → w21 … w25        (the remaining 5)
   nothing dropped: 20 + 5 = all 25, each shown exactly once, oldest-first
```

If you instead pick **All**, Session 1 is `w1 … w25` at once. Either way the union
across sessions is your whole list. (This is the fix for the old "newest-first
starvation" bug — new cards are now introduced oldest-first, so old words can't
be buried behind newer ones.)

---

## 2. The Smart Kanji deck (kanji-in-word)

When you add a word with **Also study as Kanji** on, the smart deck is built in
two coverage-critical steps (see [`lib/kanji-sync.ts`](../lib/kanji-sync.ts)):

1. **Extract every kanji of the word** — `kanjiChars()` in
   [`lib/kanji-deck.ts`](../lib/kanji-deck.ts) returns each unique CJK character
   (kana/latin contribute nothing). No kanji of a word is skipped at this step.
2. **Choose the desired characters.** An uncurated word defaults to every kanji
   that has a JLPT level. A curated array uses exactly the user's unique selected
   characters, including an explicitly selected ungraded kanji.
3. **Reconcile without losing history.** Desired cards are activated/updated;
   deselected cards remain stored but inactive so reselecting restores their SRS
   schedule.

At study time the deck is filtered by an **active JLPT level**, which is
**cumulative** (`matchesLevel()`):

- Selecting **N4** shows **N5 + N4** (the level and everything *easier* — N5 is
  `jlpt 5`, N1 is `jlpt 1`, so "easier" = a higher number).
- **All** shows every card, so you can revise the whole set.
- Within the chosen level, the same `buildSession()` rules apply (due-first, new
  oldest-first, size cap), so the per-session coverage guarantee carries over.

### Worked example — 食べる then 食事 at N5

```
Add 食べる (toggle on): kanji = [食] → 食 is N5 → card { 食, 食べる, reading た }
Add 食事   (toggle on): kanji = [食,事] → 食 N5, 事 N4
   → card { 食, 食事, reading しょく }   (a SECOND 食 card, grouped under 食)
   → card { 事, 食事, reading じ }        (N4)

Active level N5  → shows the two 食 cards (N5);  事 (N4) is hidden.
Active level N4  → shows 食 (N5) AND 事 (N4)     (cumulative).
Active level All → shows everything.
```

Every active graded kanji is reachable at its own level, any harder cumulative
selection, or **All**. Active ungraded selections are reachable through **All**.

---

## 3. Acceptance criteria (what the tests assert)

`lib/coverage.test.ts` is the executable version of the guarantees above. It
passes iff:

**Word decks — `buildSession()`**

| ID | Criterion |
| -- | --------- |
| AC1 | **Every due review appears**, even when the new-card cap is tiny (due is never capped). |
| AC2 | With size **All**, the queue contains **every** due and new card; only future-due cards are excluded. |
| AC3 | Draining over successive sessions surfaces **every new card exactly once, oldest-first** — the cap defers, never deletes (no duplicates, full coverage). |
| AC4 | A single session contains **no duplicate** cards. |
| AC5 | Future-due cards are **deferred, not lost** — absent from a normal session, present under cram. |

**Smart Kanji deck — `matchesLevel()` / `kanjiChars()`**

| ID | Criterion |
| -- | --------- |
| AC6 | **All** surfaces every kanji card. |
| AC7 | Selecting a level is **cumulative**: N4 includes N5 + N4; harder levels are excluded. |
| AC8 | **Every leveled kanji is reachable** — by All, by N1 (cumulative = all), and by its own level. Nothing stranded. |
| AC9 | **Every kanji of a word is extracted** (de-duplicated, first-seen order); kana/latin add nothing. |
| AC13 | Refreshing server card data preserves the live queue order and relearning duplicates. |
| AC14 | Cards that become inactive are removed from the queue without restarting it. |

Run them with:

```bash
node --test lib/coverage.test.ts   # just these
node --test                        # the whole suite
```

`lib/kanji-selection.test.ts` additionally checks strict API selection rules;
`lib/kanji-sync.test.ts` checks creation, metadata updates, activation, and
deactivation planning. Live kanjiapi.dev and kuroshiro integration still requires
the running application/network.
