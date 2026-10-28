// The PATCH body for updating a word that's already in the list from an import
// row. Only non-empty cells are carried, so an import never wipes fields the
// user filled in by hand (e.g. their Marathi tips). The fields come from
// COLUMNS — the same list the import preview edits — so a new column (as
// `sentence` once was) can't be shown and edited but then silently dropped.

import { COLUMNS, type VocabInput } from "./types.ts";

export function nonEmptyPatch(r: VocabInput): Partial<VocabInput> {
  const patch: Partial<VocabInput> = {};
  for (const { key } of COLUMNS) {
    const v = (r[key] ?? "").toString().trim();
    if (v) (patch as Record<string, string>)[key] = v;
  }
  return patch;
}
