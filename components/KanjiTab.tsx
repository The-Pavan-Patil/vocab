"use client";

import { Activity } from "react";
import type { Vocab, VocabLoadState } from "@/lib/types";
import Flashcards from "@/components/Flashcards";
import SmartKanjiDeck from "@/components/SmartKanjiDeck";
import ScreenHeader from "@/components/ScreenHeader";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { setSearchParams, useSearchParam } from "@/hooks/use-search-param";

// The Kanji tab holds two study surfaces:
//  · "Word Kanji" — whole-word glyph-only cards (the original kanji deck).
//  · "All Kanji" — every individual kanji you study, ungated (no JLPT/due
//    filter), newest word first, grouped so the same kanji's words run together.
// Both stay mounted (via <Activity>) so switching keeps each session's progress;
// the hidden one has its effects torn down, and the All-Kanji deck only loads
// while it's the visible view.
export default function KanjiTab({
  vocab,
  kanjiVocab,
  loadState,
  loadedAt,
  active,
  onVocabChanged,
}: {
  // The full word list — the All-Kanji deck resolves a card's source row from
  // it so the word can be edited mid-session.
  vocab: Vocab[];
  kanjiVocab: Vocab[];
  // The page's fetch of `vocab`, for the Word Kanji deck (see Flashcards). The
  // All-Kanji deck loads its own cards.
  loadState?: VocabLoadState;
  loadedAt?: number;
  active: boolean;
  onVocabChanged?: (updated: Vocab) => void;
}) {
  // In the URL (?view=all) so a reload or a shared link keeps the deck.
  const view = useSearchParam("view") === "all" ? "all" : "word";
  const setView = (next: "word" | "all") =>
    setSearchParams({ view: next === "word" ? null : next });

  return (
    // gap-2: the visible deck's session line sits right under the title.
    <div className="flex flex-col gap-2">
      <ScreenHeader
        title="Kanji"
        className="mx-auto w-full max-w-xl"
        actions={
          // A segmented track: the selected deck is the white segment, so it
          // never looks like a hovered one.
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "word" | "all")}
            spacing={1}
            className="rounded-lg bg-muted p-0.5"
            aria-label="Kanji deck"
          >
            <ToggleGroupItem value="word">Word Kanji</ToggleGroupItem>
            <ToggleGroupItem value="all">All Kanji</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <Activity mode={view === "word" ? "visible" : "hidden"}>
        <Flashcards
          vocab={kanjiVocab}
          mode="kanji"
          loadState={loadState}
          loadedAt={loadedAt}
          onVocabChanged={onVocabChanged}
        />
      </Activity>
      <Activity mode={view === "all" ? "visible" : "hidden"}>
        <SmartKanjiDeck
          variant="all"
          active={active && view === "all"}
          vocab={vocab}
          onVocabChanged={onVocabChanged}
        />
      </Activity>
    </div>
  );
}
