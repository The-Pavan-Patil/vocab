"use client";

import { Activity, useState } from "react";
import type { Vocab } from "@/lib/types";
import Flashcards from "@/components/Flashcards";
import SmartKanjiDeck from "@/components/SmartKanjiDeck";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// The Kanji tab holds two study surfaces:
//  · "Word Kanji" — whole-word glyph-only cards (the original kanji deck).
//  · "All Kanjis" — every individual kanji you study, ungated (no JLPT/due
//    filter), newest word first, grouped so the same kanji's words run together.
// Both stay mounted (via <Activity>) so switching keeps each session's progress;
// the hidden one has its effects torn down, and the All-Kanjis deck only loads
// while it's the visible view.
export default function KanjiTab({
  vocab,
  kanjiVocab,
  active,
  onVocabChanged,
}: {
  // The full word list — the All-Kanjis deck resolves a card's source row from
  // it so the word can be edited mid-session.
  vocab: Vocab[];
  kanjiVocab: Vocab[];
  active: boolean;
  onVocabChanged?: (updated: Vocab) => void;
}) {
  const [view, setView] = useState<"word" | "all">("word");

  return (
    <div className="flex flex-col gap-5">
      <div className="mx-auto">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as "word" | "all")}
          variant="outline"
          spacing={0}
        >
          <ToggleGroupItem value="word">Word Kanji</ToggleGroupItem>
          <ToggleGroupItem value="all">All Kanjis</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Activity mode={view === "word" ? "visible" : "hidden"}>
        <Flashcards
          vocab={kanjiVocab}
          mode="kanji"
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
