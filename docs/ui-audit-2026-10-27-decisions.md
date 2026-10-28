# UI audit decisions — 2026-10-27

Decisions made during two back-to-back audits of the study app UI, for review.
Each entry says what was decided, why, and what the alternative was, so any of
them can be reversed on purpose.

- **Task 1** — Web Interface Guidelines re-audit (`web-design-guidelines` skill,
  latest `vercel-labs/web-interface-guidelines/command.md`), then fixes.
  Bead: `vocab-i5s.17`.
- **Task 2** — Design audit with the `design-taste-frontend` skill, then the
  suggested UI edits. Bead: `vocab-xrl`.

Verification limits: this machine has no `.env.local`, so the app can't run
against Supabase. Changes were checked with `tsc`, `eslint`, `node --test
lib/*.test.ts` and `next build`; anything that needs eyes in a browser is listed
under "Needs manual QA" at the end.

## Process decisions

- **Scope of the re-audit.** `app/`, `components/` (including the vendored
  shadcn primitives in `components/ui/`) and `hooks/`. API routes and `lib/`
  aren't UI and were left out.
- **Three independent reviewers, then verification.** The audit was split
  across three read-only reviewers (shell/auth/primitives, study decks,
  dictionary/list/forms) that were given the guidelines but not my opinions.
  Every finding was re-checked against the code before acting on it; findings
  that didn't hold up are listed under "Rejected findings" with the reason.
- **Severity bar.** Same scale as the 2026-10-21 audit: [H] blocks keyboard or
  screen-reader use, loses data or breaks layout; [M] noticeable degradation;
  [L] polish. All [H] and [M] findings are fixed; [L] findings are fixed when
  cheap and safe, otherwise listed as declined.

## Task 1 — Web Interface Guidelines

**Result.** 2 [H], 29 [M], ~42 [L] findings. All [H] and [M] fixed; the cheap
[L]s fixed; the rest declined below with reasons. The deck files (Flashcards,
SmartKanjiDeck, KanjiTab, KanjiBreakdown) were implemented by a delegated agent
from a written spec and reviewed afterwards; everything else by hand.

### Decisions

1. **One focus-ring style, solid instead of tinted.** Buttons, toggles, tabs,
   switches, the nav and the study cards now use `ring-2 ring-ring` with a 2px
   offset (≈3.4:1 against the paper background). The shadcn default
   `ring-ring/50` measured ≈1.7:1, below the 3:1 WCAG 1.4.11 asks of a focus
   indicator, and a 50% tint *can't* reach 3:1 on this background at any hue.
   The offset keeps the ring readable on the teal primary button, where a ring
   touching the fill would vanish. Inputs, selects and textareas keep their
   soft halo, because their border already turns solid `--ring` on focus.
   `outline-none` became `outline-hidden` everywhere, so focus is still drawn
   in Windows High Contrast (which strips box-shadow rings). Plain links get a
   2px solid outline. *Alternative:* keep the halo and add an outline. That was
   rejected as visually heavy (two indicators).
2. **Navigation breakpoint moved from `sm` to `lg`.** This fixes the [H] header
   overflow. Measured in headless Chrome, the one-row header needs ≈1,250px at
   the desktop root scale, so it scrolled sideways from 640–1279px and pushed
   the account menu off-screen. Now:
   - below 1024px: the bottom nav, as on phones (tablets are touch-first anyway);
   - 1024–1279px: icon tabs in the header (named for screen readers, `title`
     for a hover tooltip);
   - 1280px and up: icon + label.

   Re-measured after the change: no horizontal overflow at 640–1440px.
   *Alternatives:* a two-row header (labels still don't fit at 768px), short
   labels like "Dict" on desktop, or lowering the desktop root font-size (the
   deliberate "master scale lever"). Task 2 revisits the nav visually.
3. **Unsaved-work guards keep working in hidden tabs.** `useBeforeUnload` now
   reports into one shared registry instead of adding a listener per
   component. Its effect deliberately has no cleanup, because `<Activity>`
   tears effects down whenever a tab is hidden, which used to switch the
   guard off the moment you changed tabs. Trade-off: a change made while a tab
   is hidden (an import finishing) is only picked up when the tab is shown
   again, so the worst case is one extra "Leave site?" prompt, never lost work.
   The listener is attached only while something is dirty (to keep bfcache).
   The decks now also guard reviews that haven't reached the server.
4. **`VocabLoadState` ("loading" / "failed" / "ready") passed to tabs.** List,
   Flashcards and Word Kanji used to show "No words yet / Add your first word"
   while loading and after a failed load. Now they show skeletons while
   loading, and nothing when the load failed (the page's alert covers that).
   A `loadedAt` timestamp also goes to the decks, so a list reload hours into a
   kept-alive session rebuilds the queue against the current time instead of
   the session's start.
5. **Retry on the "Couldn't load your words" alert** keeps the alert (and
   focus) until a fetch succeeds, shows "Retrying…", then moves focus to the
   main content. Before, it unmounted the focused button instantly.
6. **`aria-disabled` + a guard instead of `disabled` for busy states.** This
   covers save/submit buttons in the Add form and both dialogs, import row
   and bulk actions, deck end-screen buttons, Retry and export. A disabled
   button drops keyboard focus to `<body>`. This was already the pattern for
   List's delete button. The decks agent chose to keep `disabled` on
   controls only for `reviewBlocked` (a failed save), because that state lasts
   and the controls would otherwise look usable but do nothing.
7. **Export is now a button that downloads in place** (fetch → Blob) instead
   of an `<a href>`. A failed export used to replace the whole app with a raw
   JSON error page, losing every tab's state. It now shows a spinner and an
   error toast with Retry. Cost: Cmd-click "open in new tab" no longer applies,
   which means little for a download.
8. **Import preview is protected.** Choosing or dropping a new file while a
   preview is on screen now asks "Replace the current preview?" every time,
   not only after edits, because unimported rows are work either way. A file
   that fails to parse or reads as empty leaves the old preview alone (it used
   to wipe it). *Alternative:* track per-row edits and only ask when something
   was edited. That was rejected as more state for little gain.
9. **The import box takes dropped files.** It looked like a drop zone but
   wasn't one, and dropping a file made the browser navigate to it (losing all
   tabs). It now highlights on drag and reads the file.
10. **Rows with no word show a "Needs a word" badge** (destructive) and an
    invalid Kanji cell, and stay in the preview after "Import N new". Before,
    they were labelled "New", skipped, then silently dropped.
11. **Form dialogs no longer focus-and-select the word on open.** With a mouse
    or trackpad, the Kanji field gets focus without its text selected (one
    stray key used to replace the prefilled word). On touch, the dialog itself
    gets focus so the keyboard doesn't pop up. This matches the app's existing
    `useDesktopAutoFocus` policy.
12. **"Also study as Kanji" rows are shadcn choice cards.** The whole row is
    the label (no dead zones), drawn with a border and tinted when on. The
    switch is named by its title alone (`aria-labelledby`), with the
    description attached via `aria-describedby`, so the description isn't read
    as part of its name. This is a visible change on Add and in both dialogs.
13. **The dialogs are real `<form>`s**, so Enter in a field saves, as on the
    Add tab.
14. **Grading guards double-clicks** (`event.detail > 1` is ignored). A
    double-click used to grade the next card before you saw it. Undo is
    deferred (see beads).
15. **"Saving…" badge only after 500ms pending.** Most saves take ~200ms, so it
    used to blink on every grade, and controls dimmed to 50% each time.
16. **Progress fill animates `transform: scaleX`** instead of `width`. The
    rounded end squashes slightly mid-animation; switching to `translateX`
    would avoid that if it shows.
17. **Headings.** Each dictionary result's word is now an `<h2>` (details are
    `<h3>`). Added: the Add card's title, the import preview title, and the
    decks' end-screen titles.
18. **Smaller fixes.**
    - The dictionary shows "Couldn't reach the dictionary" + Try again, not
      "No matches", when a search fails.
    - After deleting the only search match, focus goes to the search box.
    - After a successful add, focus returns to the Kanji field (desktop only).
    - The row count is announced only once typing pauses.
    - The word count uses `Intl.NumberFormat`.
    - Long emails wrap on the login notices.
    - Sign-out shows "Signing out…".
    - Select triggers got a light-theme hover.
    - The destructive alert's description is at full strength (4.27:1 → ≥4.5:1).
    - The furigana `rt` has an ~11px floor.
    - Smart Kanji's annotated prompt glyphs went from 55% to 80% opacity, which
      fixes ≈2.1:1 contrast.
    - Clipped deck text now wraps or scrolls.
    - The Kanji level lookup says "Level unknown" instead of "?".
    - Deck error copy says grading is paused and how to resume.
    - The bottom-nav pill fits its column at 320px.
    - The nav label size is in rem.
    - `ConfirmDialog` no longer runs `onCancel` right after `onConfirm`.

### Rejected or declined findings

- **Title Case for headings and buttons** (all three reviewers): declined.
  The app uses sentence case consistently, which is a legitimate house style
  (Apple and Material both use it). Converting would be churn with no user
  benefit. The same goes for first person in login copy ("We sent…").
- **`overscroll-behavior: none` on `<html>` for fine pointers:** declined. It
  also disables two-finger swipe Back/Forward on Mac trackpads, which now steps
  between tabs (each tab is a history entry).
- **"Password updated" toast is never seen** (reset password): kept. The toast
  renders while the browser fetches `/`, and the full reload is needed so the
  proxy re-reads the session. Not verified in a browser; it's on the QA list.
- **Undo for grades:** deferred to a bead. It needs the review outbox to hold
  sends, or a server revert, plus restoring the queue. The double-click guard
  above removes the accidental case in the meantime.
- **`lang="ja"` inside live-region strings and aria-labels:** declined for now.
  It would mean building announcements as DOM nodes, and screen readers honour
  `lang` inside live regions inconsistently.
- **Deck settings in the URL:** declined. Category and session size are
  per-browser study preferences, kept in localStorage on purpose (the code
  says so).
- **Kanji deck back face marks the reading `lang="ja"`:** kept. The field can
  hold kana as well as romaji.
- **Virtualizing the list and import preview:** already tracked as
  `vocab-i5s.16`.

## Task 2 — Taste-skill design pass

**How it was run.** I used the `design-taste-frontend` skill's app-screen run
(`references/app-screens.md`) and its "restyle an existing app screen" path:
record the before, critique, restyle inside the existing stack, record the
after.

To see real screens without a `.env.local`, the production build ran against
a **local fake Supabase** (auth plus a small PostgREST subset) behind a
cookie-injecting proxy. It used sample data: 46 words and 18 kanji cards for a
learner about five weeks in. No app code was changed for this; the harness
lives outside the repo (see "Local preview harness" below). Every screen was
measured with `inspect.mjs --app` at 1440, 768 and 390px, before and after,
plus scripted interactive states (flipped card, hint, Edit dialog, All Kanji).

### The before, in brief

- **Inspector:** 2 FAIL on every app screen. The card "ring" was read as a
  floating shadow, and the bottom nav's "Import" sat 11px from the phone's
  edge. Login had no h1.
- **Inspector WARNs:** cream palette; mixed-font headline (the brand
  `日本語 Vocab` was the h1 on every screen); big empty blocks on Kanji,
  Smart Kanji, Import and login.
- **Linter:** 5 FAIL (four tiny uppercase letter-spaced labels and an
  `example.com` placeholder). Also an unused Geist Mono font, two blurred
  "glass" bars, and pulsing skeletons.
- **By eye:**
  - No screen said what it was. The screen's real question ("what's left in
    this session?") was answered in 12px grey under the card.
  - The teal sat on chrome (active tab, every primary button, toggles, hover
    tints) instead of on the study data.
  - The Word Kanji card rendered narrower than the Flashcards card (layout
    bug).
  - Empty table cells were blank instead of a dash.
  - Deleting was a red icon on every row.

### Direction

- **Style dealt:** `achromatic-ledger` (seed 1477655714), one of two options
  (the other was `editorial-greeting`). Kind `workspace`, `--keep palette`,
  no redraws. It was chosen because the app is used in long daily sessions,
  and the style moves colour off the chrome onto the data, which was the
  app's biggest deviation from the app-screen rules. Type: Geist (dealt, so
  unchanged).
- **The face:** a stone ground (washi, not cream) carries the warmth; the
  one teal goes only on the study itself.
- **Signature element:** the **session strip**. Under the card, one mark per
  card in the session, filled in teal as each is cleared, so "12 to go" reads
  as twelve words. Past 60 cards it falls back to a bar.
- **Each screen's question:**
  - Flashcards, Kanji and Smart Kanji: "What's left in this session, and of
    what kind?"
  - Dictionary: "What does this word mean, and is it worth adding?"
  - List: "What's in my list?"
  - Import: "Will my file import cleanly?"

### Decisions

1. **Palette roles** (`app/globals.css`):
   - **Ground:** stone `#f6f5f3`. The old `#fbfaf7` paper tripped the
     inspector's cream check, as does any warm white at that lightness. The
     stone looks almost the same and gives the white cards a real tone step.
   - **Cards:** pure white.
   - **The one filled action:** sumi ink.
   - **Hover/highlight:** neutral, no longer a sage tint.
   - **Secondary grey:** darkened from ≈4.1:1 to ≈5.2:1. It failed the 4.5:1
     floor before.
   - **Borders:** control borders are one step stronger than card borders.
   - **New `--data` token:** teal, for study progress and the kanji being
     tested.
   - **Focus ring:** stays teal (a state, not chrome; 4.9:1).

   *Alternative:* keep the paper and defend the WARN. Rejected, because the
   stone costs nothing visually and fixes the surface step.
2. **Teal leaves the chrome.** Primary buttons are ink. The active nav item
   is a neutral grey pill. Switches are ink when on. Links are ink with an
   underline, so they stay distinguishable from grey text without colour.
3. **Shell: a labelled 240px sidebar on desktop** (the dealt "open plane"),
   with no top bar. The wordmark and the word count (as the app's scope) sit
   at the top, the account at the foot. This **replaces Task 1's icon-only
   tabs at 1024–1279px**: with a sidebar, labels always fit. Below 1024px
   there's an opaque top bar plus the existing bottom nav. I didn't adopt the
   sheet's phone pattern (a 48px top bar with a menu sheet): the bottom nav is
   in thumb reach and is what the app already has. Neither bar is blurred
   any more.
4. **Every screen has a title row** (`components/ScreenHeader.tsx`): an h1 at
   ~24px plus one grey line about its data, such as "26 left in this session
   · 10 due, 16 new" or "46 words · 14 in the Kanji deck". The brand is now a
   wordmark, not the h1. All seven tab panels stay mounted, so a
   `ScreenVisibleContext` makes only the showing screen's title an `h1`; the
   others render as `<p>`. The document holds exactly one h1 at any time (the
   inspector had been reading a hidden one).
5. **Tight radii** (≈6px controls, ≈8px cards), from the style. A flashcard
   now reads as an index card, not a pill. *Alternative:* keep the soft radii,
   which also satisfy the skill's bimodal rule.
6. **Cards have a 1px border instead of a 1px ring** (box-shadow), which the
   inspector read as a floating shadow.
7. **Inputs and selects are white** on the stone ground (they were
   transparent).
8. **List table:**
   - headers are 12px grey sentence case, with lighter row rules and no
     hover fill;
   - empty fields show a grey dash (read as "none");
   - the mostly empty "Kanji deck" column is gone, replaced by the Kanji tab's
     icon after the word, so the table fits beside the sidebar at 1440;
   - Edit and Delete are pinned to the right edge at every width, and the
     word is pinned left on phones;
   - the delete icon is grey and turns red on hover. Before, 46 red icons
     were noise.
9. **Tiny uppercase tracked labels became sentence case.** This covers "tap
   to flip", "Marathi", "Sentence", the source word on the back, and Smart
   Kanji's "Reading of 学 here?".
10. **Marathi tip and hint panels use a tone step** instead of a sage tint
    plus border.
11. **Skeletons are static** grey blocks (app rule: no shimmer). **Dialog
    overlays** are a flat warm scrim with no backdrop blur.
12. **Geist Mono removed.** It was loaded but unused, so this is one less
    font download.
13. **Word Kanji width bug fixed.** The deck now spans its column like
    Flashcards.
14. **Import shows an example row** of the expected columns under the drop
    box, which is real reference data instead of an empty screen. The drop
    box's dashed edge is now visible, and the description no longer breaks
    on a dangling "·".
15. **Search boxes' clear ×** is redrawn in grey (it was the platform's blue).
16. **Login and reset password** use a real h1. The `you@example.com`
    placeholder is gone (the label already says "Email").
17. **All Kanji** folds its "newest word first" note into the session line
    instead of a second grey line.

### Where I deliberately didn't follow the sheet

- **Seven destinations.** The skill wants 4–5 in a phone bottom bar. Merging
  Import into List and Smart Kanji into the Kanji tab would get there, but
  that's an information-architecture change. It's filed as a bead for you to
  decide.
- **The root type-scale lever** (desktop body ≈17.5px vs the sheet's 14px) is
  kept. It's the documented comfort decision for long study sessions.
- **Soft charcoal ink** is kept (not `#111`), for low eye strain.
- **The sheet's "home" pattern** (greeting + count tiles) wasn't used,
  because the app has no home screen.

### The after

- **Inspector:** 0 FAIL on all eight screens. The remaining WARNs, defended:
  - "panel-void" inside the study card: the card is a fixed stage holding one
    word, so it doesn't jump in size between words;
  - "hero-void" on login: a single focused form;
  - "Import" at 16px from the phone edge: the nav's side padding has since
    gone from 0.375 to 0.5rem (about 2px more). That wasn't re-measured.
- **Linter:** 0 FAIL. The remaining shadow WARNs are all on things that
  float (menu, select popover, focused skip link) or on the unused vendored
  `TabsTrigger`. 45 em dashes remain, mostly in code comments.
- **App-screen critique** (the skill's seven questions):
  1. The decks answer their question first: the title row and strip carry
     it, and the card is the largest block.
  2. Every block shares its column's edges. The List fits at 1440 and
     scrolls inside its frame below that, with actions pinned.
  3. Teal appears only on the strip, the tested kanji and focus rings (well
     under 1% of pixels); the chrome is ink.
  4. The counts agree: the title line and the strip label come from the same
     queue.
  5. Empty fields show dashes.
  6. Legends: not applicable.
  7. On phones the nav folds to the bottom bar, titles are 21px, and every
     block still answers its question.
- **What still falls short:**
  - At 1440 the decks are a centred focus column with wide margins. A session
    side panel could use that width, but I left it alone as a feature, not a
    restyle.
  - The 7-item phone nav is still tight (11px labels).
  - The strip has no colour until the first grade.

## Local preview harness

To take the screenshots above, I ran the real app against a fake Supabase. The
harness is in this session's scratchpad, not the repo. It's three small files:

- `fake/fixtures.mjs`: sample data
- `fake/server.mjs`: fake auth + REST, and a proxy that adds a session cookie
- `interact.mjs`: scripted interactive states

To run it:

1. Run `node fake/server.mjs`.
2. Build and start the app with
   `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=fake`.
3. Browse `http://127.0.0.1:4000`.

If you want it kept, it could move into the repo (e.g. `scripts/preview/`) so
the manual-QA pass can run without a real Supabase project. It isn't added
yet.

## Needs manual QA

Everything in bead `vocab-i5s.15`, which now includes the Task 1 checks, plus
these from Task 2:

- **Desktop sidebar:**
  - Up/Down arrows move between sections and Enter switches.
  - The active section is a grey pill.
  - The account row opens its menu upwards.
  - Tab order runs sidebar → content.
- **Screen titles:** each tab's title is announced as the page heading by
  VoiceOver, and switching tabs announces the new one.
- **Kanji tab:** the segmented switcher's selected deck is the white segment
  and hovering the other doesn't look selected.
- **Session strip:** marks fill in teal as you grade (instant with Reduce
  Motion). A 60+ card session shows a bar.
- **List in Safari:** with the table scrolled sideways, Edit/Delete stay
  pinned right, and on a phone the word column stays pinned left.
- **Search clear ×:** it's grey in Safari and Chrome.
- **Dialogs on an iPhone:** the overlay is a flat scrim with no blur, and
  the keyboard doesn't pop on open.
- **Fonts:** check no layout depends on Geist Mono (it's no longer loaded).
