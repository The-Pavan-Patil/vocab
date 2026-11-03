// The page's one copy of the word list, kept current from the rows the server
// hands back after a save, so adding or editing a word doesn't refetch them all.

import type { Vocab } from "./types.ts";

// GET /api/vocab's order: newest first, ties (a batch import shares one
// created_at) by id — so merged rows sit where a refetch would put them.
const newestFirst = (a: Vocab, b: Vocab) =>
  Date.parse(b.created_at) - Date.parse(a.created_at) ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The list with `saved` patched in: a row already listed is replaced where it
 * stands, a new one goes on top in the order GET /api/vocab uses.
 */
export function mergeSavedWords(list: Vocab[], saved: Vocab[]): Vocab[] {
  if (saved.length === 0) return list;
  const byId = new Map(saved.map((word) => [word.id, word]));
  const listed = new Set(list.map((word) => word.id));
  const added = [...byId.values()]
    .filter((word) => !listed.has(word.id))
    .sort(newestFirst);
  const replaced = list.map((word) => byId.get(word.id) ?? word);
  return added.length > 0 ? [...added, ...replaced] : replaced;
}

/**
 * Whether saving `saved` (or deleting them) can have changed the kanji cards:
 * a word that studies its kanji now, or did before, or that the loaded kanji
 * cards come from (`hasCards`; it may have some although it's off here). The
 * server re-syncs those, so the kanji decks need a fresh copy.
 */
export function touchesKanjiCards(
  list: Vocab[],
  saved: Vocab[],
  hasCards: (vocabId: string) => boolean = () => false
): boolean {
  const before = new Map(list.map((word) => [word.id, word]));
  return saved.some(
    (word) =>
      word.study_as_kanji ||
      before.get(word.id)?.study_as_kanji === true ||
      hasCards(word.id)
  );
}

export type FetchTicket = { fetch: number; changesBefore: number };

// Local changes kept for replay — far more than can happen during one fetch.
const MAX_REPLAYED_CHANGES = 200;

/**
 * Lets full fetches of the list and local saves land in any order without one
 * undoing the other. Each fetch takes a ticket when it starts. When it lands,
 * a fetch that started before one already shown is ignored (its data is
 * older); otherwise the local changes made since it started are replayed on
 * top of its data, since it may have been read before they were saved.
 */
export class WordListLedger {
  private changeSeq = 0;
  private changes: { seq: number; apply: (list: Vocab[]) => Vocab[] }[] = [];
  private fetchSeq = 0;
  private shownFetch = 0;

  /** Whether any full fetch has been shown yet. */
  get hasLanded(): boolean {
    return this.shownFetch > 0;
  }

  /** A local change (a merge or a delete), as a function of the list. */
  record(apply: (list: Vocab[]) => Vocab[]): void {
    this.changes.push({ seq: ++this.changeSeq, apply });
    if (this.changes.length > MAX_REPLAYED_CHANGES) this.changes.shift();
  }

  start(): FetchTicket {
    return { fetch: ++this.fetchSeq, changesBefore: this.changeSeq };
  }

  /** The list to show for a landed fetch, or null to ignore it. */
  land(ticket: FetchTicket, data: Vocab[]): Vocab[] | null {
    if (ticket.fetch < this.shownFetch) return null;
    this.shownFetch = ticket.fetch;
    return this.changes
      .filter((change) => change.seq > ticket.changesBefore)
      .reduce((list, change) => change.apply(list), data);
  }
}
