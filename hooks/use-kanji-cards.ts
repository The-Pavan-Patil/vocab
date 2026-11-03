"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { KanjiCard, KanjiDeckData, KanjiInfo } from "@/lib/types";
import { fetchKanji, fetchKanjiCards, type KanjiPrefetch } from "@/lib/api";
import {
  kanjiCardsVersion,
  noteKanjiCardWords,
  subscribeKanjiCardsChanged,
} from "@/lib/kanji-cards-events";

// The Smart Kanji section's one copy of the kanji cards, shared by both of its
// decks (each projects it onto its own schedule).
//
// Fetched ONCE — on the section's first show — together with the details of
// every kanji in the cards' words. Re-showing the tab never refetches (the ref
// survives <Activity>, which re-runs this effect on every show). It refetches
// only when the user's words changed in a way that can touch the cards
// (`wordsVersion`, bumped by the page when a saved or deleted word studies its
// kanji or has cards here), or a deck-wide sync ran (lib/kanji-cards-events),
// and then only once the section is showing. The page may have fetched the
// cards already, in the background (`prefetched`): that copy is used when it
// was read at the same version of the words.
// No deck-wide sync runs here: adding, editing and importing a word already
// reconcile that word's kanji cards on the server.
export function useKanjiCards({
  active,
  wordsVersion,
  prefetched = null,
}: {
  active: boolean;
  wordsVersion: number;
  prefetched?: KanjiPrefetch | null;
}) {
  const [cards, setCards] = useState<KanjiCard[]>([]);
  const [kanji, setKanji] = useState<Record<string, KanjiInfo>>({});
  // When `cards` arrived (0 = never) — see useStudySession's loadedAt.
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const syncVersion = useSyncExternalStore(
    subscribeKanjiCardsChanged,
    kanjiCardsVersion,
    () => 0
  );
  // Kanji whose fallback lookup failed; retried when a card asks again.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  // Which version of the data we last fetched, so a re-show is a no-op.
  const fetchedRef = useRef<string | null>(null);
  // The prefetched copy already used, once (or failed): later fetches go to
  // the server, so a failed prefetch isn't shown again on the next show.
  const usedPrefetchRef = useRef<Promise<KanjiDeckData> | null>(null);
  // Only the newest request may land (a word change can overlap a fetch).
  const requestRef = useRef(0);
  const inFlightKanjiRef = useRef(new Set<string>());
  // The details as ensureKanji reads them. Written the moment details arrive —
  // not in an effect: a deck's effects run before this (parent) hook's, so a
  // deck asking right after the first load would see an empty map. A ref also
  // keeps ensureKanji's identity stable as details arrive.
  const kanjiRef = useRef(kanji);
  const mergeKanji = useCallback((entries: Record<string, KanjiInfo>) => {
    kanjiRef.current = { ...kanjiRef.current, ...entries };
    setKanji(kanjiRef.current);
  }, []);

  useEffect(() => {
    if (!active) return;
    const version = `${wordsVersion}:${reloadToken}:${syncVersion}`;
    if (fetchedRef.current === version) return;
    fetchedRef.current = version;
    const request = ++requestRef.current;
    const ready =
      prefetched &&
      prefetched.tag === `${wordsVersion}:${syncVersion}` &&
      usedPrefetchRef.current !== prefetched.promise
        ? prefetched.promise
        : null;
    if (ready) usedPrefetchRef.current = ready;
    (ready ?? fetchKanjiCards())
      .then((data) => {
        if (request !== requestRef.current) return;
        setCards(data.cards);
        noteKanjiCardWords(
          data.cards.flatMap((card) => (card.vocab_id ? [card.vocab_id] : []))
        );
        mergeKanji(data.kanji);
        setLoadedAt(Date.now());
        setError(null);
      })
      .catch((e) => {
        if (request !== requestRef.current) return;
        // Let the next show (or Retry) try again.
        fetchedRef.current = null;
        setError((e as Error).message);
      })
      .finally(() => {
        if (request === requestRef.current) setLoading(false);
      });
  }, [active, wordsVersion, reloadToken, syncVersion, prefetched, mergeKanji]);

  const retry = useCallback(() => {
    setError(null);
    // With nothing loaded yet, show the loading state rather than falling
    // through to the empty state while the refetch runs.
    setLoading((current) => current || cards.length === 0);
    setReloadToken((n) => n + 1);
  }, [cards.length]);

  // Details for kanji the one fetch didn't have cached (first seen since the
  // last sync). A failed one is retried the next time a card asks for it.
  const ensureKanji = useCallback(
    (characters: string[]) => {
      const missing = characters.filter(
        (c) => !kanjiRef.current[c] && !inFlightKanjiRef.current.has(c)
      );
      if (missing.length === 0) return;
      for (const c of missing) inFlightKanjiRef.current.add(c);
      setFailed((current) => {
        if (!missing.some((c) => current.has(c))) return current;
        const next = new Set(current);
        for (const c of missing) next.delete(c);
        return next;
      });
      Promise.all(
        missing.map((c) =>
          fetchKanji(c)
            .then((info) => [c, info] as const)
            .catch(() => [c, null] as const)
        )
      ).then((entries) => {
        for (const [c] of entries) inFlightKanjiRef.current.delete(c);
        const loaded = entries.filter(
          (entry): entry is readonly [string, KanjiInfo] => entry[1] !== null
        );
        const lost = entries.filter((e) => e[1] === null).map(([c]) => c);
        if (loaded.length > 0) mergeKanji(Object.fromEntries(loaded));
        if (lost.length > 0) {
          setFailed((current) => new Set([...current, ...lost]));
        }
      });
    },
    [mergeKanji]
  );

  // Every kanji you study, in any word — the active cards are exactly the
  // kanji turned on somewhere. A card's front never hints these.
  const studied = useMemo(
    () => new Set(cards.map((card) => card.character)),
    [cards]
  );

  return {
    cards,
    kanji,
    studied,
    failed,
    loadedAt,
    loading,
    error,
    retry,
    ensureKanji,
  };
}

export type KanjiCardsStore = ReturnType<typeof useKanjiCards>;
