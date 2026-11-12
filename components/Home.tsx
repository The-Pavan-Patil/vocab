"use client";

import {
  Activity,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { PencilLine, Layers, List, Sparkles, Upload, BookOpen } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { TabsContent } from "@/components/ui/tabs";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import AddVocabForm from "@/components/AddVocabForm";
import FlashcardsSection from "@/components/FlashcardsSection";
import SmartKanjiSection from "@/components/SmartKanjiSection";
import VocabTable from "@/components/VocabTable";
import ImportPanel from "@/components/ImportPanel";
import DictionarySearch from "@/components/DictionarySearch";
import AccountMenu from "@/components/AccountMenu";
import { ScreenVisibleContext } from "@/components/ScreenHeader";
import { fetchKanjiCards, fetchVocab, type KanjiPrefetch } from "@/lib/api";
import {
  mergeSavedWords,
  touchesKanjiCards,
  WordListLedger,
  type FetchTicket,
} from "@/lib/vocab-list";
import {
  hasKanjiCards,
  kanjiCardsVersion,
  noteKanjiCardWords,
  subscribeKanjiCardsChanged,
} from "@/lib/kanji-cards-events";
import {
  setSearchParams,
  useHydrated,
  useSearchParam,
} from "@/hooks/use-search-param";
import type { Vocab, VocabLoadState } from "@/lib/types";
import type { InitialWords } from "@/lib/supabase/initial-words";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "dictionary", label: "Dictionary", short: "Dict", icon: BookOpen },
  { value: "add", label: "Add", short: "Add", icon: PencilLine },
  { value: "flashcards", label: "Flashcards", short: "Cards", icon: Layers },
  { value: "smart-kanji", label: "Smart Kanji", short: "Smart", icon: Sparkles },
  { value: "list", label: "List", short: "List", icon: List },
  { value: "import", label: "Import", short: "Import", icon: Upload },
];

const DEFAULT_TAB = "dictionary";

// Links from before the Kanji tab was split up: its Word Kanji deck now lives
// in Flashcards, its All Kanji deck in Smart Kanji.
function legacyKanjiTab(
  view: string | null
): Record<string, string | null> & { tab: string } {
  return view === "all"
    ? { tab: "smart-kanji", smart: "all", view: null }
    : { tab: "flashcards", cards: "word-kanji", view: null };
}

// Thousands grouping in the reader's locale ("1,240 words").
const WORD_COUNT = new Intl.NumberFormat();

// Coming back to the app after this long refetches the words: they may have
// been studied or edited on another device in the meantime.
const STALE_AFTER_MS = 5 * 60_000;

// One tab's screen. forceMount leaves an inactive panel un-hidden and
// focusable, so `hidden` is set by hand to take it out of the tab order and
// the accessibility tree; <Activity> keeps its state while it's away; and
// ScreenVisibleContext lets only the showing screen's title be the page's h1.
// A `deferred` panel isn't built until it's first shown — for a screen too big
// to keep pre-rendered in the background (the List: a row per word), which
// would otherwise hold thousands of hidden DOM nodes from the first load. The
// build waits on a deferred copy of "showing", so the tab switch paints first
// and the (interruptible) build of the rows follows.
function Panel({
  value,
  tab,
  hydrated,
  deferred = false,
  children,
}: {
  value: string;
  tab: string;
  hydrated: boolean;
  deferred?: boolean;
  children: React.ReactNode;
}) {
  const showing = tab === value;
  const showingSoon = useDeferredValue(hydrated && showing);
  const [shown, setShown] = useState(false);
  if (deferred && showingSoon && !shown) setShown(true);
  return (
    <TabsContent value={value} forceMount hidden={!hydrated || !showing}>
      <ScreenVisibleContext value={hydrated && showing}>
        <Activity mode={showing ? "visible" : "hidden"}>
          {deferred && !shown ? null : children}
        </Activity>
      </ScreenVisibleContext>
    </TabsContent>
  );
}

function Wordmark() {
  return (
    <p className="text-xl font-semibold tracking-tight whitespace-nowrap">
      <span lang="ja" translate="no" className="jp">日本語</span>{" "}
      <span className="font-normal text-muted-foreground">Vocab</span>
    </p>
  );
}

export default function Home({
  initialWords,
}: {
  // The list as the page's server render started loading it (app/page.tsx);
  // absent, or failed, the list is fetched from here instead.
  initialWords?: Promise<InitialWords>;
}) {
  // The active tab lives in the URL (?tab=list), so reload, Back/Forward and
  // shared links all land on the same tab. Each switch is a history entry.
  const tabParam = useSearchParam("tab");
  const viewParam = useSearchParam("view");
  const tab =
    tabParam === "kanji"
      ? legacyKanjiTab(viewParam).tab
      : TABS.some((t) => t.value === tabParam)
        ? tabParam!
        : DEFAULT_TAB;
  // The tab is read from window.location (useSearchParam), so the server's
  // HTML and the hydration pass don't know it yet. Show no panel until they
  // do, rather than flashing Dictionary on a ?tab=list load.
  const hydrated = useHydrated();
  const setTab = useCallback((next: string) => {
    setSearchParams({ tab: next === DEFAULT_TAB ? null : next }, { push: true });
  }, []);
  // Rewrite an old ?tab=kanji link in place (the render above already shows
  // the right section), so the URL names the deck it lands on.
  useEffect(() => {
    if (tabParam === "kanji") setSearchParams(legacyKanjiTab(viewParam));
  }, [tabParam, viewParam]);
  const [vocab, setVocab] = useState<Vocab[]>([]);
  // When `vocab` last changed — a fetch, or a save patched in. A deck kept
  // alive by <Activity> may have started its session hours ago; a rebuild
  // reads its queue against this clock so cards that came due in the meantime
  // are included.
  const [loadedAt, setLoadedAt] = useState(0);
  // Bumped whenever the words change after the first load in a way that can
  // touch kanji cards (a refetch, or saving / deleting a word that studies its
  // kanji or has cards loaded). The server re-syncs those words' kanji cards,
  // so the Smart Kanji section refetches its cards when this moves.
  const [wordsVersion, setWordsVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  // When the whole list was last fetched (0 = not yet), for the stale refresh.
  const fetchedAtRef = useRef(0);
  // Orders full fetches against local saves, so neither undoes the other
  // whichever lands first (see WordListLedger).
  const [ledger] = useState(() => new WordListLedger());
  const mainRef = useRef<HTMLElement>(null);
  const [listReveal, setListReveal] = useState<{
    word: string;
    requestId: number;
  } | null>(null);
  const loadState: VocabLoadState = loading
    ? "loading"
    : error && vocab.length === 0
      ? "failed"
      : "ready";
  // The list's size, shown as the app's scope beside the wordmark.
  const wordCount =
    loadState === "loading"
      ? "Loading…"
      : loadState === "failed"
        ? null
        : `${WORD_COUNT.format(vocab.length)} ${vocab.length === 1 ? "word" : "words"}`;

  // Show a full fetch of the list (unless a newer one is showing already),
  // with any local saves made since it started replayed on top. False when
  // it was dropped as stale.
  const showFetched = useCallback(
    (ticket: FetchTicket, data: Vocab[], { first = false } = {}) => {
      const list = ledger.land(ticket, data);
      if (!list) return false;
      fetchedAtRef.current = Date.now();
      setVocab(list);
      setLoadedAt(Date.now());
      // The Smart Kanji section loads its cards on its own the first time.
      if (!first) setWordsVersion((n) => n + 1);
      return true;
    },
    [ledger]
  );

  // Refetch the list. The error alert (and its Retry button) stays up until a
  // fetch succeeds, so a retry that fails again doesn't flash or drop focus.
  const reload = useCallback(async () => {
    const ticket = ledger.start();
    try {
      showFetched(ticket, await fetchVocab());
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [ledger, showFetched]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    const ok = await reload();
    setRetrying(false);
    // The alert — and the focused Retry button — go away on success; hand
    // focus to the content rather than letting it fall to <body>.
    if (ok) mainRef.current?.focus({ preventScroll: true });
  }

  // Initial load: the server's copy, already on its way with the page, or —
  // when that failed (or there is none) — a fetch from here, which also
  // handles a lapsed session (to /login) and shows a failure. Kept separate
  // from `reload` so we don't call setState synchronously inside the effect.
  useEffect(() => {
    let active = true;
    const ticket = ledger.start();
    // Promise.resolve is needed: what arrives is React's streamed stand-in for
    // the server promise, whose own .then doesn't chain. A stream cut short
    // (lost signal, a redeploy) rejects it — that falls back to a fetch too.
    (initialWords
      ? Promise.resolve(initialWords).then(
          (result) => ("data" in result ? result.data : fetchVocab()),
          () => fetchVocab()
        )
      : fetchVocab()
    )
      .then((d) => {
        if (active) showFetched(ticket, d, { first: true });
      })
      .catch((e) => {
        // A save meanwhile may have loaded the list already; then it's fine.
        if (active && !ledger.hasLanded) setError((e as Error).message);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [initialWords, ledger, showFetched]);

  // Back on the app (tab shown again, or its window focused) with a list older
  // than STALE_AFTER_MS: refetch it quietly. Studying on a phone and then
  // returning to an open desktop tab otherwise shows cards as due that were
  // just reviewed. A failed refresh keeps what's on screen (no alert); the next
  // return tries again. Before the first load lands there's nothing to refresh.
  useEffect(() => {
    let refreshing = false;
    function refreshIfStale() {
      if (document.visibilityState !== "visible" || refreshing) return;
      const fetchedAt = fetchedAtRef.current;
      if (fetchedAt === 0 || Date.now() - fetchedAt < STALE_AFTER_MS) return;
      refreshing = true;
      const ticket = ledger.start();
      // Background: a signed-out session doesn't yank the page to /login on a
      // mere focus (a half-typed word would go with it).
      fetchVocab({ background: true })
        .then((data) => {
          if (showFetched(ticket, data)) setError(null);
        })
        .catch(() => {})
        .finally(() => {
          refreshing = false;
        });
    }
    document.addEventListener("visibilitychange", refreshIfStale);
    window.addEventListener("focus", refreshIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfStale);
      window.removeEventListener("focus", refreshIfStale);
    };
  }, [ledger, showFetched]);

  // The list as the save callbacks below compare against. Updated after every
  // render, so a callback reads the list it's about to patch.
  const vocabRef = useRef(vocab);
  useLayoutEffect(() => {
    vocabRef.current = vocab;
  });

  // Rows the server just saved — added, imported, or edited (also from inside
  // a study session). Patching them in (instead of refetching every word)
  // shows the change at once and keeps every deck's in-progress session
  // intact: a deck swaps a card in place when the list's membership hasn't
  // changed. The clock moves too, as a reload's would, so a deck rebuilt for
  // an added word includes the cards that came due meanwhile.
  // Every save is also recorded in the ledger, so a full fetch already in
  // flight replays it rather than undoing it. Until a first fetch has shown
  // there's no list to patch (still loading, or it failed), so a save
  // refetches the whole list instead.
  const applySavedWords = useCallback(
    (saved: Vocab[]) => {
      if (saved.length === 0) return;
      ledger.record((list) => mergeSavedWords(list, saved));
      if (!ledger.hasLanded) {
        void reload();
        return;
      }
      const kanjiChanged = touchesKanjiCards(
        vocabRef.current,
        saved,
        hasKanjiCards
      );
      setVocab((current) => mergeSavedWords(current, saved));
      setLoadedAt(Date.now());
      if (kanjiChanged) setWordsVersion((n) => n + 1);
    },
    [ledger, reload]
  );
  const applyVocabUpdate = useCallback(
    (updated: Vocab) => applySavedWords([updated]),
    [applySavedWords]
  );

  // A deleted word leaves the list now; its kanji cards went with it (the
  // database cascades), so the kanji decks refetch if it had any.
  const removeWord = useCallback(
    (id: string) => {
      const without = (list: Vocab[]) => list.filter((word) => word.id !== id);
      ledger.record(without);
      if (!ledger.hasLanded) {
        void reload();
        return;
      }
      const removed = vocabRef.current.filter((word) => word.id === id);
      const kanjiChanged =
        touchesKanjiCards(vocabRef.current, removed) || hasKanjiCards(id);
      setVocab(without);
      setLoadedAt(Date.now());
      if (kanjiChanged) setWordsVersion((n) => n + 1);
    },
    [ledger, reload]
  );

  // The Smart Kanji cards, fetched ahead of the section's first show so
  // opening the tab doesn't start the request. It lives here: a hidden tab
  // runs no effects. Tagged with the versions it was read at; the section only
  // uses a match. Once per page load in the background (if any word studies
  // its kanji — else there are no cards to wait for); after a change, only
  // when the person heads for the tab (hover, focus, press).
  const kanjiSyncVersion = useSyncExternalStore(
    subscribeKanjiCardsChanged,
    kanjiCardsVersion,
    () => 0
  );
  const kanjiTag = `${wordsVersion}:${kanjiSyncVersion}`;
  const smartKanjiShowing = hydrated && tab === "smart-kanji";
  const studiesKanji = vocab.some((word) => word.study_as_kanji);
  const [kanjiPrefetch, setKanjiPrefetch] = useState<KanjiPrefetch | null>(null);
  // The version already fetched — ahead, or by the section while showing.
  const kanjiCoveredRef = useRef<string | null>(null);
  const kanjiAutoPrefetchedRef = useRef(false);
  const prefetchKanjiCards = useCallback(() => {
    if (loadState !== "ready" || kanjiCoveredRef.current === kanjiTag) return;
    kanjiCoveredRef.current = kanjiTag;
    const promise = fetchKanjiCards({ background: true });
    // Which words have cards, as the section would note on its own fetch.
    // Unused is fine: a failure only shows if the section ends up using it.
    promise.then(
      (data) =>
        noteKanjiCardWords(
          data.cards.flatMap((card) => (card.vocab_id ? [card.vocab_id] : []))
        ),
      () => {}
    );
    setKanjiPrefetch({ tag: kanjiTag, promise });
  }, [loadState, kanjiTag]);
  useEffect(() => {
    // Showing, the section fetches for itself.
    if (smartKanjiShowing) {
      kanjiCoveredRef.current = kanjiTag;
      kanjiAutoPrefetchedRef.current = true;
      return;
    }
    if (loadState !== "ready" || !studiesKanji || kanjiAutoPrefetchedRef.current) {
      return;
    }
    const start = () => {
      kanjiAutoPrefetchedRef.current = true;
      prefetchKanjiCards();
    };
    // After the screen in front has settled.
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(start, 300);
    return () => window.clearTimeout(handle);
  }, [loadState, smartKanjiShowing, studiesKanji, kanjiTag, prefetchKanjiCards]);
  // Heading for the Smart Kanji tab: fetch its cards now, ahead of the click.
  const towardSmartKanji = (value: string) =>
    value === "smart-kanji"
      ? {
          onPointerEnter: prefetchKanjiCards,
          onPointerDown: prefetchKanjiCards,
          onFocus: prefetchKanjiCards,
        }
      : {};

  const revealWordInList = useCallback((word: string) => {
    setListReveal((current) => ({
      word,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setTab("list");
  }, [setTab]);

  return (
    <TabsPrimitive.Root
      value={hydrated ? tab : ""}
      onValueChange={setTab}
      // Arrow keys move focus along the tabs; Enter/Space switches. Automatic
      // activation would push a history entry for every tab passed over.
      activationMode="manual"
      orientation="vertical"
      className="flex min-h-full flex-col lg:flex-row"
    >
      {/* Keyboard users can jump past the header and tab nav. */}
      <a
        href="#main"
        className="sr-only rounded-md bg-background px-3 py-2 text-sm font-medium shadow-md ring-3 ring-ring/50 focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50"
      >
        Skip to content
      </a>

      {/* Desktop: a labelled sidebar on the page ground, one hairline from
          the canvas — the product and its scope at the top, the six
          sections, the account at the foot. Each screen names itself in its
          own h1, so the brand here is a wordmark, not a heading. Below lg the
          top bar and the bottom nav take over. */}
      <aside className="sticky top-0 hidden h-svh w-48 shrink-0 flex-col gap-8 border-r border-border px-3 py-6 lg:flex">
        <div className="px-2.5">
          <Wordmark />
          {wordCount && (
            <p className="mt-0.5 text-sm text-muted-foreground tabular-nums">
              {wordCount}
            </p>
          )}
        </div>
        <TabsPrimitive.List aria-label="Sections" className="flex flex-col gap-0.5">
          {TABS.map((t) => (
            <TabsPrimitive.Trigger
              key={t.value}
              value={t.value}
              {...towardSmartKanji(t.value)}
              className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-left text-sm whitespace-nowrap text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[state=active]:bg-secondary data-[state=active]:font-medium data-[state=active]:text-foreground"
            >
              <t.icon className="size-4 shrink-0" aria-hidden />
              {t.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        <div className="mt-auto">
          <AccountMenu variant="row" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone and tablet: brand · word count · account, over the bottom
            nav. Opaque — no blur behind it. */}
        <header className="sticky top-0 z-20 border-b border-border bg-background lg:hidden">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
            <Wordmark />
            <p className="ml-auto text-sm whitespace-nowrap text-muted-foreground tabular-nums">
              {wordCount}
            </p>
            <AccountMenu />
          </div>
        </header>

        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 lg:px-8 lg:pt-8 lg:pb-12"
        >
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>Couldn’t load your words</AlertTitle>
              <AlertDescription>
                {error.replace(/\.$/, "")}. Check your connection, then retry.
              </AlertDescription>
              <AlertAction>
                <Button
                  size="sm"
                  variant="outline"
                  // aria-disabled, not disabled: the button keeps focus while
                  // the retry runs.
                  onClick={() => void retry()}
                  aria-disabled={retrying || undefined}
                  className="aria-disabled:opacity-50"
                >
                  {retrying && <Spinner data-icon="inline-start" aria-hidden />}
                  {retrying ? "Retrying…" : "Retry"}
                </Button>
              </AlertAction>
            </Alert>
          )}

          {/* Every panel stays mounted (forceMount) and is shown/hidden via
              React's <Activity>, so each tab keeps its in-progress state when you
              switch away — the flashcard session, a dictionary search, a half-typed
              word, import preview rows. Activity also runs effect cleanup on hide
              (e.g. Flashcards' keyboard listener detaches), so it doesn't leak
              across tabs the way a plain always-mounted panel would.
              Panel (above) shows how each is hidden. */}
          <Panel value="add" tab={tab} hydrated={hydrated}>
            <AddVocabForm
              onAdded={applySavedWords}
              onRevealInList={revealWordInList}
            />
          </Panel>
          <Panel value="dictionary" tab={tab} hydrated={hydrated}>
            <DictionarySearch
              vocab={vocab}
              onAdded={applySavedWords}
              onRevealInList={revealWordInList}
            />
          </Panel>
          <Panel value="flashcards" tab={tab} hydrated={hydrated}>
            <FlashcardsSection
              vocab={vocab}
              loadState={loadState}
              loadedAt={loadedAt}
              onVocabChanged={applyVocabUpdate}
            />
          </Panel>
          <Panel value="smart-kanji" tab={tab} hydrated={hydrated}>
            <SmartKanjiSection
              active={hydrated && tab === "smart-kanji"}
              vocab={vocab}
              wordsVersion={wordsVersion}
              prefetched={kanjiPrefetch}
              onVocabChanged={applyVocabUpdate}
            />
          </Panel>
          <Panel value="list" tab={tab} hydrated={hydrated} deferred>
            <VocabTable
              vocab={vocab}
              loadState={loadState}
              onSaved={applyVocabUpdate}
              onDeleted={removeWord}
              revealWord={listReveal}
            />
          </Panel>
          <Panel value="import" tab={tab} hydrated={hydrated}>
            <ImportPanel vocab={vocab} onImported={applySavedWords} />
          </Panel>
        </main>
      </div>

      {/* Mobile: fixed bottom navigation in the thumb zone. */}
      <nav
        data-app-nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pr-[max(0.5rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(0.5rem,env(safe-area-inset-left))] lg:hidden"
      >
        <ul className="grid grid-cols-6">
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <li key={t.value}>
                {/* A real link (the tab is in the URL), so Cmd/Ctrl-click and
                    middle-click open it in a new browser tab. */}
                <a
                  href={t.value === DEFAULT_TAB ? "/" : `/?tab=${t.value}`}
                  {...towardSmartKanji(t.value)}
                  onClick={(event) => {
                    const newTab =
                      event.metaKey || event.ctrlKey || event.shiftKey;
                    if (newTab || event.button !== 0) return;
                    event.preventDefault();
                    setTab(t.value);
                  }}
                  aria-current={active ? "page" : undefined}
                  aria-label={t.label}
                  className="flex w-full flex-col items-center gap-1 rounded-lg px-1 pt-2 pb-1.5 outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  {/* Fills its column (capped), so the active pill never
                      spills into the neighbouring item on a 320px phone. */}
                  {/* Active: a neutral pill and ink, like the sidebar — no
                      brand colour on the chrome. */}
                  <span
                    className={cn(
                      "flex w-full max-w-16 items-center justify-center rounded-full py-1 transition-colors",
                      active ? "bg-secondary text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <t.icon className="size-6 shrink-0" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "text-[0.65rem] leading-none",
                      active
                        ? "font-semibold text-foreground"
                        : "font-medium text-muted-foreground"
                    )}
                  >
                    {t.short}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </TabsPrimitive.Root>
  );
}
