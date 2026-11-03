// A version number for "the kanji cards changed on the server", for changes
// that don't go through the page's word list — a deck-wide sync retried from a
// toast. The Smart Kanji section reads it (useSyncExternalStore) and refetches
// when it moves, even if the change landed while its tab was hidden.

let version = 0;
const listeners = new Set<() => void>();

export function announceKanjiCardsChanged(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeKanjiCardsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function kanjiCardsVersion(): number {
  return version;
}

// The words the loaded kanji cards come from, as last fetched. A word's own
// `study_as_kanji` isn't proof it has none: a failed sync, or another device,
// can leave active cards on a word that's off here — so a save of any word
// listed here refreshes the kanji decks too.
let cardWordIds: ReadonlySet<string> = new Set();

export function noteKanjiCardWords(vocabIds: Iterable<string>): void {
  cardWordIds = new Set(vocabIds);
}

export function hasKanjiCards(vocabId: string): boolean {
  return cardWordIds.has(vocabId);
}
