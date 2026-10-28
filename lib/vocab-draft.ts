// Whether a word being edited differs from where it started — decides if
// closing an edit dialog needs a "discard changes?" check. Compares the fields a
// person types or picks (every COLUMNS field plus the study-as-kanji toggle),
// treating null / undefined / "" and surrounding whitespace as equal so an
// untouched form never counts as dirty. The kanji selection is left out on
// purpose: <KanjiBreakdown> reports its computed default on load, which would
// mark every freshly opened word as changed.

import { COLUMNS, type VocabInput } from "./types.ts";

const norm = (v: unknown) => (v ?? "").toString().trim();

export function isDraftDirty(start: VocabInput, draft: VocabInput): boolean {
  if (Boolean(start.study_as_kanji) !== Boolean(draft.study_as_kanji)) {
    return true;
  }
  return COLUMNS.some(({ key }) => norm(start[key]) !== norm(draft[key]));
}
