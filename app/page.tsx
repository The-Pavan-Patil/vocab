"use client";

import {
  Activity,
  useCallback,
  useEffect,
  useRef,
  useState,
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
import { fetchVocab } from "@/lib/api";
import {
  setSearchParams,
  useHydrated,
  useSearchParam,
} from "@/hooks/use-search-param";
import type { Vocab, VocabLoadState } from "@/lib/types";
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

// One tab's screen. forceMount leaves an inactive panel un-hidden and
// focusable, so `hidden` is set by hand to take it out of the tab order and
// the accessibility tree; <Activity> keeps its state while it's away; and
// ScreenVisibleContext lets only the showing screen's title be the page's h1.
function Panel({
  value,
  tab,
  hydrated,
  children,
}: {
  value: string;
  tab: string;
  hydrated: boolean;
  children: React.ReactNode;
}) {
  const showing = tab === value;
  return (
    <TabsContent value={value} forceMount hidden={!hydrated || !showing}>
      <ScreenVisibleContext value={hydrated && showing}>
        <Activity mode={showing ? "visible" : "hidden"}>{children}</Activity>
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

export default function Home() {
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
  // The URL can't be read on the server, so the prerendered HTML and the
  // hydration pass don't know the tab yet. Show no panel until they do, rather
  // than flashing Dictionary on a ?tab=list load.
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
  // When `vocab` was fetched. A deck kept alive by <Activity> may have started
  // its session hours ago; a reload rebuilds its queue against this clock so
  // cards that came due in the meantime are included.
  const [loadedAt, setLoadedAt] = useState(0);
  // Bumped whenever the words change after the first load (a reload, or an
  // edit made inside a deck). The server re-syncs a word's kanji cards on every
  // change, so the Smart Kanji section refetches its cards when this moves.
  const [wordsVersion, setWordsVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
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

  // Refetch the list. The error alert (and its Retry button) stays up until a
  // fetch succeeds, so a retry that fails again doesn't flash or drop focus.
  const reload = useCallback(async () => {
    try {
      const data = await fetchVocab();
      setVocab(data);
      setLoadedAt(Date.now());
      setWordsVersion((n) => n + 1);
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    const ok = await reload();
    setRetrying(false);
    // The alert — and the focused Retry button — go away on success; hand
    // focus to the content rather than letting it fall to <body>.
    if (ok) mainRef.current?.focus({ preventScroll: true });
  }

  // Initial load. Kept separate from `reload` so we don't call setState
  // synchronously inside the effect body.
  useEffect(() => {
    let active = true;
    fetchVocab()
      .then((d) => {
        if (!active) return;
        setVocab(d);
        setLoadedAt(Date.now());
      })
      .catch((e) => active && setError((e as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // A word edited from inside a study session. Patching the one row (instead of
  // refetching) keeps every deck's in-progress session intact — a deck swaps
  // the card in place when the list's membership hasn't changed.
  const applyVocabUpdate = useCallback((updated: Vocab) => {
    setVocab((current) =>
      current.map((word) => (word.id === updated.id ? updated : word))
    );
    setWordsVersion((n) => n + 1);
  }, []);

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
            <AddVocabForm onAdded={reload} onRevealInList={revealWordInList} />
          </Panel>
          <Panel value="dictionary" tab={tab} hydrated={hydrated}>
            <DictionarySearch
              vocab={vocab}
              onAdded={reload}
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
              onVocabChanged={applyVocabUpdate}
            />
          </Panel>
          <Panel value="list" tab={tab} hydrated={hydrated}>
            <VocabTable
              vocab={vocab}
              loadState={loadState}
              onChanged={reload}
              revealWord={listReveal}
            />
          </Panel>
          <Panel value="import" tab={tab} hydrated={hydrated}>
            <ImportPanel vocab={vocab} onImported={reload} />
          </Panel>
        </main>
      </div>

      {/* Mobile: fixed bottom navigation in the thumb zone. */}
      <nav
        data-app-nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-2 pb-[env(safe-area-inset-bottom)] lg:hidden"
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
