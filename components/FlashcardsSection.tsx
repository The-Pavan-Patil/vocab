"use client";

import { Activity } from "react";
import type { Vocab, VocabLoadState } from "@/lib/types";
import VocabDeck from "@/components/decks/VocabDeck";
import WordKanjiDeck from "@/components/decks/WordKanjiDeck";
import DeckSubTabs from "@/components/study/DeckSubTabs";
import ScreenHeader from "@/components/ScreenHeader";
import { setSearchParams, useSearchParam } from "@/hooks/use-search-param";

// The Flashcards section holds the two whole-word decks:
//  · "Vocab" — every word, reading shown; recall the meaning.
//  · "Word Kanji" — opted-in words as bare glyphs; recall reading + meaning.
// Both study the page's one word list (no fetch of their own), each on its own
// schedule. Both stay mounted (via <Activity>) so switching keeps each
// session's progress; the hidden one has its effects torn down.
type View = "vocab" | "word-kanji";

const VIEWS: { value: View; label: string }[] = [
  { value: "vocab", label: "Vocab" },
  { value: "word-kanji", label: "Word Kanji" },
];

export default function FlashcardsSection({
  vocab,
  loadState,
  loadedAt,
  onVocabChanged,
}: {
  vocab: Vocab[];
  loadState: VocabLoadState;
  loadedAt: number;
  onVocabChanged?: (updated: Vocab) => void;
}) {
  // In the URL (?cards=word-kanji) so a reload or a shared link keeps the deck.
  const view: View = useSearchParam("cards") === "word-kanji" ? "word-kanji" : "vocab";
  const setView = (next: View) =>
    setSearchParams({ cards: next === "vocab" ? null : next });

  return (
    // gap-2: the visible deck's session line sits right under the title.
    <div className="flex flex-col gap-2">
      <ScreenHeader
        title="Flashcards"
        className="mx-auto w-full max-w-xl"
        actions={
          <DeckSubTabs
            label="Flashcard deck"
            value={view}
            options={VIEWS}
            onChange={setView}
          />
        }
      />

      <Activity mode={view === "vocab" ? "visible" : "hidden"}>
        <VocabDeck
          vocab={vocab}
          loadState={loadState}
          loadedAt={loadedAt}
          onVocabChanged={onVocabChanged}
        />
      </Activity>
      <Activity mode={view === "word-kanji" ? "visible" : "hidden"}>
        <WordKanjiDeck
          vocab={vocab}
          loadState={loadState}
          loadedAt={loadedAt}
          onVocabChanged={onVocabChanged}
        />
      </Activity>
    </div>
  );
}
