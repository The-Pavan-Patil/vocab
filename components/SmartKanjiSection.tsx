"use client";

import { Activity } from "react";
import type { Vocab } from "@/lib/types";
import type { KanjiPrefetch } from "@/lib/api";
import { useKanjiCards } from "@/hooks/use-kanji-cards";
import SmartKanjiDeck from "@/components/decks/SmartKanjiDeck";
import AllKanjiDeck from "@/components/decks/AllKanjiDeck";
import DeckSubTabs from "@/components/study/DeckSubTabs";
import { DeckLoading } from "@/components/study/DeckChrome";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { setSearchParams, useSearchParam } from "@/hooks/use-search-param";

// The Smart Kanji section holds the two kanji-in-word decks:
//  · "Smart Kanji" — filtered to a JLPT level.
//  · "All Kanji" — every level, newest word first, grouped by kanji.
// They study the same cards, loaded ONCE here and shared (useKanjiCards), but
// each on its own independent schedule. Both stay mounted (via <Activity>) so
// switching keeps each session's progress.
type View = "smart" | "all";

const VIEWS: { value: View; label: string }[] = [
  { value: "smart", label: "Smart Kanji" },
  { value: "all", label: "All Kanji" },
];

export default function SmartKanjiSection({
  active,
  vocab,
  wordsVersion,
  prefetched = null,
  onVocabChanged,
}: {
  // Whether this section is the tab showing — the cards load on first show.
  active: boolean;
  vocab: Vocab[];
  // Bumped by the page whenever a word change can touch the cards (which the
  // server re-syncs from the words), so they're refetched — once, when showing.
  wordsVersion: number;
  // The cards, fetched ahead by the page (see useKanjiCards).
  prefetched?: KanjiPrefetch | null;
  onVocabChanged?: (updated: Vocab) => void;
}) {
  // In the URL (?smart=all) so a reload or a shared link keeps the deck.
  const view: View = useSearchParam("smart") === "all" ? "all" : "smart";
  const setView = (next: View) =>
    setSearchParams({ smart: next === "smart" ? null : next });
  const store = useKanjiCards({ active, wordsVersion, prefetched });
  const deckName = view === "all" ? "All Kanji" : "Smart Kanji";
  const hasCards = store.cards.length > 0;

  return (
    // gap-2: the visible deck's session line sits right under the title.
    <div className="flex flex-col gap-2">
      <ScreenHeader
        title="Smart Kanji"
        className="mx-auto w-full max-w-xl"
        actions={
          <DeckSubTabs
            label="Kanji deck"
            value={view}
            options={VIEWS}
            onChange={setView}
          />
        }
      />

      {store.error && (
        <div className="mx-auto w-full max-w-xl">
          <Alert variant="destructive">
            <AlertTitle>
              {hasCards ? `${deckName} needs attention` : `${deckName} couldn’t load`}
            </AlertTitle>
            <AlertDescription>
              {store.error.replace(/\.$/, "")}. Check your connection, then
              retry.
            </AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline" onClick={store.retry}>
                Retry
              </Button>
            </AlertAction>
          </Alert>
        </div>
      )}

      {store.loading ? (
        <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
          <DeckLoading label="Loading kanji…" />
        </div>
      ) : store.error && !hasCards ? null : (
        <>
          <Activity mode={view === "smart" ? "visible" : "hidden"}>
            <SmartKanjiDeck
              store={store}
              vocab={vocab}
              onVocabChanged={onVocabChanged}
            />
          </Activity>
          <Activity mode={view === "all" ? "visible" : "hidden"}>
            <AllKanjiDeck
              store={store}
              vocab={vocab}
              onVocabChanged={onVocabChanged}
            />
          </Activity>
        </>
      )}
    </div>
  );
}
