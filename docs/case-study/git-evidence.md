# Git Evidence Map

This report ranks investigation leads. Inspect the diffs before making case-study claims.

## Repository

- Root: `/Users/pavanpatil/Developer/vocab`
- Remote: `https://github.com/The-Pavan-Patil/vocab.git`
- Branch: `main`
- Commits analyzed: 25
- Merge commits excluded from rankings: 5
- Working tree entries: 0
- History window: 2026-06-15 to 2026-07-20

## Category Counts

- feature: 10
- architecture: 9
- bug: 6
- tooling: 5
- change: 3

## Architecture Candidates

| Commit | Date | Score | Change | Layers | Diff |
| --- | --- | ---: | --- | --- | ---: |
| `a3cedb3` | 2026-06-30 | 57.64 | Add Beads integration for issue tracking and Kanji management | application, data, interface | +3494/-195 in 53 files |
| `abfa713` | 2026-07-17 | 55.31 | Fix Smart Kanji review consistency | application, data, interface | +1828/-536 in 32 files |
| `ae89923` | 2026-06-16 | 49.45 | Enhance Japanese vocabulary app with new features and dependencies. Updated Next.js configuration to exclude server-only packages, added new dependencies for file handling and UI components, and improved styling with custom CSS variables. Expanded README with setup instructions and app features. Implemented a responsive layout with tabs for adding vocabulary, flashcards, and importing files. | application, data, interface | +6643/-105 in 66 files |
| `ef4720d` | 2026-07-20 | 49.30 | fix: keep flashcard reviews responsive | application, data, interface | +895/-131 in 15 files |
| `cec9cfc` | 2026-07-06 | 44.68 | Implement kanji selection feature for vocabulary management | application, data, interface | +407/-65 in 16 files |
| `f9a1148` | 2026-06-17 | 43.86 | Add Supabase authentication and user management features. Introduced `@supabase/ssr` for session handling, created a login page, and implemented user-specific vocabulary access with Row Level Security. Updated README with authentication setup instructions and enhanced UI with an account menu component. | application, data, interface | +530/-83 in 19 files |
| `25948be` | 2026-07-20 | 37.48 | feat: hint unselected kanji readings | application, data, interface | +199/-20 in 9 files |
| `9fa74c8` | 2026-06-16 | 27.97 | Update Next.js configuration to allow HTTPS access from tunnel hosts and enhance the vocabulary app UI. Refactor the main page layout to use a tabbed interface, improve the import panel functionality with new update capabilities, and refine header detection for imported files. | application, interface | +298/-128 in 4 files |
| `14fd41e` | 2026-07-15 | 21.98 | Refactor DictionarySearch dialog for improved layout and scrolling | interface | +92/-87 in 2 files |

## Bug-Fix Candidates

| Commit | Date | Score | Change | Layers | Diff |
| --- | --- | ---: | --- | --- | ---: |
| `a3cedb3` | 2026-06-30 | 57.64 | Add Beads integration for issue tracking and Kanji management | application, data, interface | +3494/-195 in 53 files |
| `abfa713` | 2026-07-17 | 55.31 | Fix Smart Kanji review consistency | application, data, interface | +1828/-536 in 32 files |
| `ef4720d` | 2026-07-20 | 49.30 | fix: keep flashcard reviews responsive | application, data, interface | +895/-131 in 15 files |
| `d6b490b` | 2026-06-20 | 31.60 | Integrate beads (bd) issue tracker | unclassified | +475/-0 in 13 files |
| `c3726b2` | 2026-07-09 | 25.17 | Add password reset functionality with site URL handling | application, interface | +47/-6 in 6 files |
| `1316cf6` | 2026-06-22 | 20.77 | Fix flashcard 'Study again': cram mode to re-study a finished session now | application, interface | +31/-3 in 3 files |

## Feature Candidates

| Commit | Date | Score | Change | Layers | Diff |
| --- | --- | ---: | --- | --- | ---: |
| `a3cedb3` | 2026-06-30 | 57.64 | Add Beads integration for issue tracking and Kanji management | application, data, interface | +3494/-195 in 53 files |
| `cec9cfc` | 2026-07-06 | 44.68 | Implement kanji selection feature for vocabulary management | application, data, interface | +407/-65 in 16 files |
| `f9a1148` | 2026-06-17 | 43.86 | Add Supabase authentication and user management features. Introduced `@supabase/ssr` for session handling, created a login page, and implemented user-specific vocabulary access with Row Level Security. Updated README with authentication setup instructions and enhanced UI with an account menu component. | application, data, interface | +530/-83 in 19 files |
| `25948be` | 2026-07-20 | 37.48 | feat: hint unselected kanji readings | application, data, interface | +199/-20 in 9 files |
| `3409e81` | 2026-06-18 | 33.41 | Implement spaced repetition for flashcards. Added SRS scheduling logic to manage review intervals based on user performance, including a new API route for recording reviews. Updated Flashcards component to handle grading and session management. Enhanced README and added documentation for the SRS algorithm. | application, data, interface | +887/-140 in 8 files |
| `e5e8900` | 2026-06-15 | 32.76 | Initial commit from Create Next App | interface | +304/-0 in 19 files |
| `c3726b2` | 2026-07-09 | 25.17 | Add password reset functionality with site URL handling | application, interface | +47/-6 in 6 files |
| `4b9f56e` | 2026-06-19 | 21.53 | Dedup vocab on add so re-adding a word is a no-op | application, interface | +60/-16 in 5 files |
| `d1351dc` | 2026-06-20 | 17.31 | Add 'Add N more / Study N more cards' to grow a flashcard session | interface | +63/-10 in 2 files |
| `3313022` | 2026-06-20 | 17.05 | Accept Bearer token in requireUser (mobile backend support) | application, data | +34/-9 in 1 files |

## Tooling And Recovery Candidates

| Commit | Date | Score | Change | Layers | Diff |
| --- | --- | ---: | --- | --- | ---: |
| `a3cedb3` | 2026-06-30 | 57.64 | Add Beads integration for issue tracking and Kanji management | application, data, interface | +3494/-195 in 53 files |
| `abfa713` | 2026-07-17 | 55.31 | Fix Smart Kanji review consistency | application, data, interface | +1828/-536 in 32 files |
| `ef4720d` | 2026-07-20 | 49.30 | fix: keep flashcard reviews responsive | application, data, interface | +895/-131 in 15 files |
| `cec9cfc` | 2026-07-06 | 44.68 | Implement kanji selection feature for vocabulary management | application, data, interface | +407/-65 in 16 files |
| `25948be` | 2026-07-20 | 37.48 | feat: hint unselected kanji readings | application, data, interface | +199/-20 in 9 files |

## Frequently Changed Files

| File | Commits |
| --- | ---: |
| `README.md` | 8 |
| `app/page.tsx` | 8 |
| `docs/spaced-repetition.md` | 7 |
| `components/Flashcards.tsx` | 7 |
| `lib/api.ts` | 7 |
| `components/DictionarySearch.tsx` | 7 |
| `lib/types.ts` | 6 |
| `app/api/vocab/route.ts` | 6 |
| `components/SmartKanjiDeck.tsx` | 5 |
| `app/api/vocab/[id]/route.ts` | 5 |
| `components/AddVocabForm.tsx` | 5 |
| `components/ImportPanel.tsx` | 5 |
| `lib/kanji-sync.ts` | 4 |
| `supabase/schema.sql` | 4 |
| `app/api/vocab/[id]/review/route.ts` | 4 |
| `lib/srs.ts` | 4 |
| `package.json` | 4 |
| `.beads/interactions.jsonl` | 4 |
| `lib/parse.ts` | 4 |
| `.gitignore` | 4 |

## Suggested Diff Inspection

- `git -C '/Users/pavanpatil/Developer/vocab' show --stat a3cedb3`
- `git -C '/Users/pavanpatil/Developer/vocab' show a3cedb3 -- '.beads/.gitignore' '.beads/README.md' '.beads/config.yaml'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat abfa713`
- `git -C '/Users/pavanpatil/Developer/vocab' show abfa713 -- 'README.md' 'app/api/kanji-cards/[id]/review/route.ts' 'app/api/kanji-cards/route.ts'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat ae89923`
- `git -C '/Users/pavanpatil/Developer/vocab' show ae89923 -- '.agents/skills/shadcn/SKILL.md' '.agents/skills/shadcn/agents/openai.yml' '.agents/skills/shadcn/assets/shadcn-small.png'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat ef4720d`
- `git -C '/Users/pavanpatil/Developer/vocab' show ef4720d -- 'README.md' 'app/api/kanji-cards/[id]/review/route.ts' 'app/api/vocab/[id]/review/route.ts'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat cec9cfc`
- `git -C '/Users/pavanpatil/Developer/vocab' show cec9cfc -- '.beads/interactions.jsonl' 'app/api/vocab/[id]/route.ts' 'app/api/vocab/route.ts'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat f9a1148`
- `git -C '/Users/pavanpatil/Developer/vocab' show f9a1148 -- 'README.md' 'app/api/export/docx/route.ts' 'app/api/export/pdf/route.ts'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat 25948be`
- `git -C '/Users/pavanpatil/Developer/vocab' show 25948be -- 'README.md' 'components/SmartKanjiDeck.tsx' 'docs/deck-coverage.md'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat 3409e81`
- `git -C '/Users/pavanpatil/Developer/vocab' show 3409e81 -- 'README.md' 'app/api/vocab/[id]/review/route.ts' 'components/Flashcards.tsx'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat e5e8900`
- `git -C '/Users/pavanpatil/Developer/vocab' show e5e8900 -- '.gitignore' 'AGENTS.md' 'CLAUDE.md'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat d6b490b`
- `git -C '/Users/pavanpatil/Developer/vocab' show d6b490b -- '.beads/.gitignore' '.beads/README.md' '.beads/config.yaml'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat 9fa74c8`
- `git -C '/Users/pavanpatil/Developer/vocab' show 9fa74c8 -- 'app/page.tsx' 'components/ImportPanel.tsx' 'lib/parse.ts'`
- `git -C '/Users/pavanpatil/Developer/vocab' show --stat c3726b2`
- `git -C '/Users/pavanpatil/Developer/vocab' show c3726b2 -- '.beads/interactions.jsonl' 'DL Services Acknowledgement.pdf' 'README.md'`

## Evidence-Specific Question Seeds

- `9fa74c8` changed app/page.tsx, components/ImportPanel.tsx, lib/parse.ts across 2 layer(s). What constraint forced this design, and which alternative did the team reject?
- `14fd41e` changed components/DictionarySearch.tsx, components/ui/dialog.tsx across 1 layer(s). What constraint forced this design, and which alternative did the team reject?
- `a3cedb3` changed .beads/.gitignore, .beads/README.md, .beads/config.yaml. What user-visible symptom triggered this fix, why was the earlier behavior possible, and how did you verify it stopped?
- `abfa713` changed README.md, app/api/kanji-cards/[id]/review/route.ts, app/api/kanji-cards/route.ts. What user-visible symptom triggered this fix, why was the earlier behavior possible, and how did you verify it stopped?
- `cec9cfc` introduced `Implement kanji selection feature for vocabulary management`. What user need drove it, and did the feature change the data or permission model?
- `f9a1148` introduced `Add Supabase authentication and user management features. Introduced `@supabase/ssr` for session handling, created a login page, and implemented user-specific vocabulary access with Row Level Security. Updated README with authentication setup instructions and enhanced UI with an account menu component.`. What user need drove it, and did the feature change the data or permission model?
- `ef4720d` added or changed tooling around README.md, app/api/kanji-cards/[id]/review/route.ts, app/api/vocab/[id]/review/route.ts. Which debugging step was slow or unreliable before this, and what became repeatable?

## Investigation Reminder

- Treat rankings as leads, not conclusions.
- Trace important changes through later fixes and current code.
- Separate verified facts, inferences, human confirmation, and unknowns.
- Exclude generated files and formatting churn from the narrative.
- Do not publish secrets, private URLs, or unsupported outcomes.
