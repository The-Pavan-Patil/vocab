"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Clock,
  Languages,
  Pencil,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import { toRomaji } from "wanakana";
import type { KanjiCard, KanjiInfo, KanjiPromptPart, Vocab } from "@/lib/types";
import {
  NEW_CARDS_PER_SESSION,
  RELEARN_GAP,
  SESSION_SIZE_OPTIONS,
  buildSession,
  isEarly,
  isNew,
  nextDueAt,
} from "@/lib/srs";
import {
  ALL_LEVELS,
  JLPT_LEVELS,
  groupByKanji,
  kanjiChars,
  levelLabel,
  matchesLevel,
  refreshQueuedKanjiCards,
} from "@/lib/kanji-deck";
import { fetchKanji, fetchKanjiCards, reviewKanjiCard, syncKanjiCards } from "@/lib/api";
import { createReviewId } from "@/lib/review-command";
import { shouldIgnoreDeckKey } from "@/lib/deck-keys";
import { promptTextSize, readingTextSize } from "@/lib/card-fit";
import { formatUntil } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { useReviewOutbox } from "@/hooks/use-review-outbox";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import EditVocabDialog from "@/components/EditVocabDialog";
import SentenceNote from "@/components/SentenceNote";
import ConfirmDialog from "@/components/ConfirmDialog";
import ScreenHeader from "@/components/ScreenHeader";
import SessionStrip from "@/components/SessionStrip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function buildKanjiQueue(
  cards: KanjiCard[],
  options: {
    isAll: boolean;
    level: number;
    now: number;
    newLimit: number;
    cram?: boolean;
  }
): KanjiCard[] {
  if (options.isAll) {
    return groupByKanji(
      [...cards].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
      )
    );
  }
  return buildSession(
    cards.filter((card) => matchesLevel(card, options.level)),
    options.now,
    { newLimit: options.newLimit, cram: options.cram }
  );
}

type KanjiGrade = "remember" | "right" | "wrong";

// What the screen reader hears after a grade, ahead of the next card.
const GRADE_SPOKEN: Record<KanjiGrade, string> = {
  remember: "Remembered",
  right: "Got it",
  wrong: "Forgot — it comes back later this session",
};

type KanjiReviewCommand = {
  reviewId: string;
  cardId: string;
  grade: KanjiGrade;
  practice: boolean;
};

// The word with the target kanji emphasized — "what reading does THIS take here?"
function WordWithFocus({ word, char }: { word: string; char: string }) {
  return <FocusedSurface surface={word} char={char} />;
}

// `hinted` means this run carries furigana — i.e. none of its kanji are cards
// of yours, so it's free context. Those sit a shade back from the unhinted grey
// (kanji you also study, which stay recall targets), and the target character
// stays in the accent colour.
function FocusedSurface({
  surface,
  char,
  hinted = false,
}: {
  surface: string;
  char: string;
  hinted?: boolean;
}) {
  return [...surface].map((character, index) => (
    <span
      key={index}
      className={cn(
        hinted ? "text-muted-foreground/80" : "text-muted-foreground",
        // The kanji being asked about carries the screen's one hue.
        character === char && "text-data"
      )}
    >
      {character}
    </span>
  ));
}

function WordWithReadingHints({
  word,
  char,
  parts,
}: {
  word: string;
  char: string;
  parts: KanjiPromptPart[] | null | undefined;
}) {
  const safeParts =
    Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every(
      (part) =>
        typeof part?.surface === "string" &&
        (part.reading === null || typeof part.reading === "string")
    ) &&
    parts.map((part) => part.surface).join("") === word
      ? parts
      : [{ surface: word, reading: null }];

  return safeParts.map((part, index) => {
    const surface = (
      <FocusedSurface
        surface={part.surface}
        char={char}
        hinted={Boolean(part.reading)}
      />
    );
    // The rt is sized in em by `.furigana-under` (globals.css) so it tracks
    // whatever scale promptTextSize picked for the prompt.
    return part.reading ? (
      <ruby key={index}>
        {surface}
        <rp>(</rp>
        <rt className="font-normal text-muted-foreground">{part.reading}</rt>
        <rp>)</rp>
      </ruby>
    ) : (
      <span key={index}>{surface}</span>
    );
  });
}

function romajiReading(reading: string | null | undefined): string {
  if (!reading?.trim()) return "";
  return toRomaji(reading).trim();
}

function compactReadings(readings: string[]): string {
  const seen = new Set<string>();
  return readings
    .map(romajiReading)
    .filter(Boolean)
    .filter((reading) => {
      if (seen.has(reading)) return false;
      seen.add(reading);
      return true;
    })
    .slice(0, 6)
    .join(", ");
}

export default function SmartKanjiDeck({
  active = true,
  variant = "smart",
  vocab = [],
  heading,
  onVocabChanged,
}: {
  active?: boolean;
  variant?: "smart" | "all";
  // The screen's h1 when this deck is a tab of its own (Smart Kanji). Inside
  // the Kanji tab it renders only the session line under that tab's title.
  heading?: string;
  // The user's words, so a card can be traced back to the row it came from and
  // edited in place. Without them the edit affordance is simply not offered.
  vocab?: Vocab[];
  onVocabChanged?: (updated: Vocab) => void;
}) {
  // "all" = the ungated "All Kanji" review: every card, no JLPT/due filter,
  // newest word first, grouped so the same kanji's words run consecutively.
  const isAll = variant === "all";
  // Errors and empty states name the deck the user is actually looking at.
  const deckName = isAll ? "All Kanji" : "Smart Kanji";
  const [loading, setLoading] = useState(true);
  const [allCards, setAllCards] = useState<KanjiCard[]>([]);
  const [level, setLevel] = useState(5);
  const [newLimit, setNewLimit] = useState<number>(NEW_CARDS_PER_SESSION);
  const [now, setNow] = useState(() => Date.now());
  const [preferencesReady, setPreferencesReady] = useState(false);

  const [remaining, setRemaining] = useState<KanjiCard[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [lapsedIds, setLapsedIds] = useState<Set<string>>(() => new Set());
  const [flipped, setFlipped] = useState(false);
  // The last grade, spoken ahead of the next card (cleared by a flip).
  const [lastGrade, setLastGrade] = useState<KanjiGrade | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, KanjiInfo>>({});
  // Kanji whose details lookup failed while the current card was showing. Reset
  // whenever the card changes, so the next visit to that kanji tries again.
  const [infoFailed, setInfoFailed] = useState<Set<string>>(() => new Set());
  // Bumped by Retry on a load/sync error to re-run the fetch effect.
  const [reloadToken, setReloadToken] = useState(0);
  // The source word of the card being edited (null = dialog closed).
  const [editing, setEditing] = useState<Vocab | null>(null);

  // Refs let async refreshes reconcile the latest cache/queue without making
  // either one a dependency that implicitly restarts the current session.
  const initializedRef = useRef(false);
  const syncedRef = useRef(false);
  const interactionHandledRef = useRef(false);
  const cardsRef = useRef<KanjiCard[]>([]);
  const remainingRef = useRef<KanjiCard[]>([]);
  const cardRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLSpanElement>(null);
  const endActionRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  // Set by grade(): once the queue moves on, put focus back on the deck if the
  // control that had it (a grade button) just unmounted.
  const refocusRef = useRef(false);
  // Whether the save-error alert was up last time we looked (see its effect).
  const hadReviewErrorRef = useRef(false);
  const faceId = useId();
  // A restart / level / size change waiting on "restart this session?".
  const [pendingReset, setPendingReset] = useState<(() => void) | null>(null);

  function flip(next?: boolean) {
    setFlipped((f) => next ?? !f);
    setLastGrade(null);
  }

  function setQueue(next: KanjiCard[]) {
    remainingRef.current = next;
    setRemaining(next);
  }

  const sendReview = useCallback(
    (command: KanjiReviewCommand) =>
      reviewKanjiCard(command.cardId, command.grade, {
        reviewId: command.reviewId,
        practice: command.practice,
      }),
    []
  );
  const applySavedReview = useCallback((updated: KanjiCard) => {
    const nextCards = cardsRef.current.map((item) =>
      item.id === updated.id ? updated : item
    );
    cardsRef.current = nextCards;
    setAllCards(nextCards);
    const nextQueue = remainingRef.current.map((item) =>
      item.id === updated.id ? updated : item
    );
    remainingRef.current = nextQueue;
    setRemaining(nextQueue);
  }, []);
  const reviewOutbox = useReviewOutbox<KanjiReviewCommand, KanjiCard>({
    send: sendReview,
    onSuccess: applySavedReview,
  });
  const sessionLocked = reviewOutbox.pendingCount > 0;
  const reviewBlocked = reviewOutbox.blocked;
  const reviewError = reviewOutbox.error;
  // Grades not yet on the server are lost if the tab closes — ask first.
  useBeforeUnload(sessionLocked);

  // Most saves take ~200ms, so a "Saving…" badge on every grade just blinks.
  // Show it only once a save has been pending for a while.
  const [slowSave, setSlowSave] = useState(false);
  if (!sessionLocked && slowSave) setSlowSave(false);
  useEffect(() => {
    if (!sessionLocked) return;
    const timer = setTimeout(() => setSlowSave(true), 500);
    return () => clearTimeout(timer);
  }, [sessionLocked]);

  useLayoutEffect(() => {
    interactionHandledRef.current = false;
  });

  function startSession(
    source: KanjiCard[],
    options: {
      level?: number;
      newLimit?: number;
      cram?: boolean;
      at?: number;
    } = {}
  ) {
    const at = options.at ?? Date.now();
    const next = buildKanjiQueue(source, {
      isAll,
      level: options.level ?? level,
      newLimit: options.newLimit ?? newLimit,
      cram: options.cram,
      now: at,
    });
    setNow(at);
    setQueue(next);
    setSessionTotal(next.length);
    setReviewedIds(new Set());
    setLapsedIds(new Set());
    setFlipped(false);
    setLastGrade(null);
    setError(null);
  }

  // Restore saved controls before the first queue is built. Waiting for this
  // client-only step avoids briefly starting a default N5/100-card session and
  // then resetting it when localStorage is applied.
  // Level and size are per-browser study preferences, so they live in
  // localStorage rather than the URL (which carries the tab and searches).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rawLv = window.localStorage.getItem("kanji:level");
    if (rawLv != null) {
      const lv = Number(rawLv);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (lv === ALL_LEVELS || JLPT_LEVELS.includes(lv)) setLevel(lv);
    }
    const raw = window.localStorage.getItem("kanji:sessionSize");
    if (raw != null) {
      const parsed = raw === "all" ? Infinity : Number(raw);
      if (parsed === Infinity || Number.isFinite(parsed)) setNewLimit(parsed);
    }
    setPreferencesReady(true);
  }, []);

  // Backfill once, then refresh whenever this surface becomes visible. A refresh
  // updates card objects inside the existing queue without changing its order or
  // progress. Newly-created cards start a normal session only when the old queue
  // was empty; otherwise they wait for the next deliberate session start.
  useEffect(() => {
    if (!active || !preferencesReady) return;
    let cancelled = false;
    (async () => {
      let syncError: string | null = null;
      try {
        if (!syncedRef.current) {
          await syncKanjiCards();
          syncedRef.current = true;
        }
      } catch (e) {
        syncError = `Some kanji cards may be out of date — syncing the deck failed (${(e as Error).message.replace(/\.$/, "")}).`;
      }

      try {
        const cards = await fetchKanjiCards();
        if (cancelled) return;
        const previousIds = new Set(cardsRef.current.map((card) => card.id));
        const hasNewCards = cards.some((card) => !previousIds.has(card.id));
        cardsRef.current = cards;
        setAllCards(cards);

        if (!initializedRef.current) {
          initializedRef.current = true;
          startSession(cards);
        } else if (remainingRef.current.length === 0 && hasNewCards) {
          startSession(cards, { cram: false });
        } else {
          setQueue(refreshQueuedKanjiCards(remainingRef.current, cards));
        }
        setError(syncError);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Level/size changes rebuild locally; they must not trigger another fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, preferencesReady, isAll, reloadToken]);

  function retryLoad() {
    setError(null);
    // With nothing loaded yet, show the loading state rather than falling
    // through to "No smart kanji yet" while the refetch runs.
    if (cardsRef.current.length === 0) setLoading(true);
    setReloadToken((n) => n + 1);
  }

  const card = remaining[0];
  // Smart cards are projections of a word, so editing one means editing its
  // source row. A card whose word is missing from `vocab` (not loaded, or the
  // deck rendered without it) simply gets no edit button.
  const cardWord = card
    ? (vocab.find((word) => word.id === card.vocab_id) ?? null)
    : null;
  const reviewedCount = reviewedIds.size;
  const done = sessionTotal - remaining.length;
  const currentWordKanji = useMemo(
    () => (card ? kanjiChars(card.word) : []),
    [card]
  );
  const currentWordKanjiKey = currentWordKanji.join("");
  const [failedForKey, setFailedForKey] = useState(currentWordKanjiKey);
  if (failedForKey !== currentWordKanjiKey) {
    setFailedForKey(currentWordKanjiKey);
    setInfoFailed(new Set());
  }

  // Lazily enrich the back of the current card with kanjiapi data for every
  // kanji in the word, not just the one being reviewed.
  useEffect(() => {
    const missing = currentWordKanji.filter(
      (character) => !info[character] && !infoFailed.has(character)
    );
    if (missing.length === 0) return;
    let active = true;
    Promise.all(
      missing.map((character) =>
        fetchKanji(character)
          .then((kanjiInfo) => [character, kanjiInfo] as const)
          .catch(() => [character, null] as const)
      )
    ).then((entries) => {
      if (!active) return;
      const loaded = entries.filter(
        (entry): entry is readonly [string, KanjiInfo] => entry[1] !== null
      );
      const failed = entries
        .filter((entry) => entry[1] === null)
        .map(([character]) => character);
      if (failed.length > 0) {
        setInfoFailed((current) => new Set([...current, ...failed]));
      }
      if (loaded.length === 0) return;
      setInfo((current) => ({
        ...current,
        ...Object.fromEntries(loaded),
      }));
    });
    return () => {
      active = false;
    };
  }, [currentWordKanji, currentWordKanjiKey, info, infoFailed]);

  // Restarting, or switching level / size, rebuilds the queue. Before the first
  // grade or after the last that's free, but mid-session it throws away the
  // run's progress (the grades themselves are already saved) — so ask.
  function guardReset(run: () => void) {
    if (reviewedCount > 0 && remaining.length > 0) setPendingReset(() => run);
    else run();
  }

  function changeLevel(next: number) {
    if (sessionLocked) return;
    if (typeof window !== "undefined") window.localStorage.setItem("kanji:level", String(next));
    setLevel(next);
    startSession(cardsRef.current, { level: next, cram: false });
  }
  function changeSize(next: number) {
    if (sessionLocked) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("kanji:sessionSize", Number.isFinite(next) ? String(next) : "all");
    }
    setNewLimit(next);
    startSession(cardsRef.current, { newLimit: next, cram: false });
  }
  function restart() {
    if (sessionLocked) return;
    refocusRef.current = true; // "Study again" unmounts with the end screen
    startSession(cardsRef.current, { cram: true });
  }

  // Editing a word re-syncs its kanji cards server-side, so pull the refreshed
  // faces (meaning, sentence, readings) into the live queue. Membership is
  // preserved — a card deselected by the edit drops out, everything else keeps
  // its place and the session keeps its progress.
  async function refreshAfterEdit() {
    try {
      const cards = await fetchKanjiCards();
      cardsRef.current = cards;
      setAllCards(cards);
      setQueue(refreshQueuedKanjiCards(remainingRef.current, cards));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function grade(g: KanjiGrade) {
    const cur = remaining[0];
    if (!cur || reviewBlocked || interactionHandledRef.current) return;
    interactionHandledRef.current = true;
    const practice = isEarly(cur, Date.now());
    const accepted = reviewOutbox.enqueue({
      reviewId: createReviewId(),
      cardId: cur.id,
      grade: g,
      practice,
    });
    if (!accepted) {
      interactionHandledRef.current = false;
      return;
    }

    setReviewedIds((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
    if (g === "wrong") setLapsedIds((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
    refocusRef.current = true;
    setLastGrade(g);
    setFlipped(false);
    const rest = remaining.slice(1);
    if (g === "wrong") rest.splice(Math.min(RELEARN_GAP, rest.length), 0, cur);
    // The run is over: measure the end screen's "Next review in …" from now,
    // not from when the session started.
    if (rest.length === 0) setNow(Date.now());
    setQueue(rest);
  }

  // A grade unmounts the button that was pressed (Forgot / Got it swap back to
  // "I remember", or the end screen replaces the card). Rather than letting
  // focus fall to <body>, hand it to the card — or to the end screen's action.
  useEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    (cardRef.current ?? endActionRef.current)?.focus();
  }, [remaining]);

  // A failed save disables the card and grade buttons, so the one with focus
  // drops it to <body> (on the end screen it sits on an inert button) — hand
  // it to Retry instead. Retry clears the error at once (the alert, and the
  // button, unmount), so then put focus back on the deck. Focus that's still
  // somewhere usable — a dialog, another control — is left alone.
  useEffect(() => {
    const active = document.activeElement;
    const lost =
      !active ||
      active === document.body ||
      active.matches(':disabled, [aria-disabled="true"]');
    if (reviewError) {
      hadReviewErrorRef.current = true;
      if (lost) retryRef.current?.focus();
      return;
    }
    if (!hadReviewErrorRef.current) return;
    hadReviewErrorRef.current = false;
    if (lost) (cardRef.current ?? endActionRef.current)?.focus();
  }, [reviewError]);

  // Keyboard: not flipped → Space/Enter flips, R = Remember. Flipped → ←/1 =
  // Forgot, →/2 = Got it, Space flips back, ↑/↓ scroll the notes while the card
  // has focus. Keys that belong to another control are left alone.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (shouldIgnoreDeckKey(e, cardRef.current)) return;
      if (
        remaining.length === 0 ||
        reviewBlocked ||
        editing !== null || // the edit dialog owns the keyboard while it's open
        interactionHandledRef.current
      )
        return;
      if (!flipped) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          flip(true);
        } else if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          grade("remember");
        }
      } else {
        const answer = answerRef.current;
        if (e.key === "ArrowLeft" || e.key === "1") {
          e.preventDefault();
          grade("wrong");
        } else if (e.key === "ArrowRight" || e.key === "2") {
          e.preventDefault();
          grade("right");
        } else if (e.key === " ") {
          e.preventDefault();
          flip(false);
        } else if (
          (e.key === "ArrowDown" || e.key === "ArrowUp") &&
          e.target === cardRef.current &&
          answer &&
          answer.scrollHeight > answer.clientHeight
        ) {
          e.preventDefault();
          answer.scrollBy({ top: e.key === "ArrowDown" ? 48 : -48 });
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, remaining, reviewBlocked, editing]);

  // The session's state, answered under the screen's title.
  const dueLeft = remaining.filter((c) => !isNew(c)).length;
  const sessionLine = card
    ? `${remaining.length} left in this session · ${dueLeft} due, ${remaining.length - dueLeft} new · ${isAll ? "newest word first" : levelLabel(level)}`
    : null;
  const header = (line: string | null) =>
    heading ? (
      <ScreenHeader title={heading}>{line}</ScreenHeader>
    ) : line ? (
      <p className="text-sm text-muted-foreground tabular-nums">{line}</p>
    ) : null;

  if (loading) {
    // The card's footprint, so the deck doesn't jump in when it arrives.
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {header(null)}
        <Skeleton className="study-card rounded-xl" aria-hidden />
        <span className="sr-only" role="status">
          Loading kanji…
        </span>
      </div>
    );
  }

  if (allCards.length === 0 && error) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {header(null)}
        <Alert variant="destructive">
          <AlertTitle>{deckName} couldn’t load</AlertTitle>
          <AlertDescription>
            {error.replace(/\.$/, "")}. Check your connection, then retry.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={retryLoad}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
      </div>
    );
  }

  if (allCards.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {header(null)}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Languages />
            </EmptyMedia>
            <EmptyTitle>
              {isAll ? "No kanji cards yet" : "No smart kanji yet"}
            </EmptyTitle>
            <EmptyDescription>
              Turn on “Also study as Kanji” when you add a word. Its JLPT-level kanji
              land here automatically, grouped per kanji with their reading in each word.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const wordReading = card?.word_reading || card?.reading || "";
  const wordRomaji = romajiReading(wordReading);
  // The cards the chosen level can draw from (every card in the All view).
  const levelPool = isAll
    ? allCards
    : allCards.filter((c) => matchesLevel(c, level));

  // One polite live region for the whole deck: the next card (after the last
  // grade), the full back face on a flip, and the recap when the queue empties.
  // The card button's own name stays short; this carries the content.
  let announcement = "";
  if (card && !flipped) {
    announcement = [
      lastGrade && GRADE_SPOKEN[lastGrade],
      `Word: ${card.word}. Reading of ${card.character} here?`,
      `${remaining.length} left`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (card) {
    announcement = [
      `Reading: ${wordReading || "unknown"}${wordRomaji ? `, ${wordRomaji}` : ""}`,
      `Meaning: ${card.word_meaning || "no meaning saved"}`,
      card.word_sentence?.trim() && `Sentence: ${card.word_sentence}`,
      // The per-kanji notes load asynchronously; announcing them would make the
      // live region re-read the whole back face when they arrive. They're on
      // the focused card (aria-describedby) for anyone who wants them.
    ]
      .filter(Boolean)
      .join(". ");
  } else if (reviewedCount > 0) {
    announcement = `${lastGrade ? `${GRADE_SPOKEN[lastGrade]}. ` : ""}Session complete. ${reviewedCount - lapsedIds.size} recalled${lapsedIds.size > 0 ? `, ${lapsedIds.size} revisited` : ""}.`;
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      {header(sessionLine)}

      {/* The All view has no settings (its order is in the session line);
          the row only appears there to show a slow save. */}
      {(!isAll || (slowSave && !reviewError)) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {isAll ? (
            <span />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(level)}
                onValueChange={(v) => guardReset(() => changeLevel(Number(v)))}
                // Not disabled while a save is in flight — that's ~200ms after
                // every grade, and the dimming flickers. changeLevel() and
                // changeSize() ignore that window.
                disabled={reviewBlocked}
              >
                <SelectTrigger className="w-32" aria-label="JLPT level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {JLPT_LEVELS.map((l) => (
                      <SelectItem key={l} value={String(l)}>
                        JLPT {levelLabel(l)}
                      </SelectItem>
                    ))}
                    <SelectItem value={String(ALL_LEVELS)}>All levels</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select
                value={Number.isFinite(newLimit) ? String(newLimit) : "all"}
                onValueChange={(v) =>
                  guardReset(() => changeSize(v === "all" ? Infinity : Number(v)))
                }
                disabled={reviewBlocked}
              >
                <SelectTrigger className="w-36" aria-label="New cards per session">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {SESSION_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={String(n)} value={Number.isFinite(n) ? String(n) : "all"}>
                        {Number.isFinite(n) ? `${n} / session` : "All new cards"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex items-center gap-2">
            {slowSave && !reviewError && (
              <Badge variant="outline">
                <Spinner data-icon="inline-start" aria-hidden /> Saving{" "}
                <span className="tabular-nums">{reviewOutbox.pendingCount}</span>…
              </Badge>
            )}
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{deckName} needs attention</AlertTitle>
          <AlertDescription>
            {error.replace(/\.$/, "")}. Check your connection, then retry.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={retryLoad}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
      )}

      {reviewError && (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t save that review</AlertTitle>
          <AlertDescription>
            {reviewError.replace(/\.$/, "")}. Grading is paused — check your
            connection, then retry.
          </AlertDescription>
          <AlertAction>
            <Button
              ref={retryRef}
              size="sm"
              variant="outline"
              onClick={reviewOutbox.retry}
            >
              Retry
            </Button>
          </AlertAction>
        </Alert>
      )}

      {!card ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">{reviewedCount > 0 ? <Sparkles /> : <Clock />}</EmptyMedia>
            <EmptyTitle>
              <h2>
                {reviewedCount > 0
                  ? "Session complete"
                  : isAll
                    ? "All caught up"
                    : `All caught up${level !== ALL_LEVELS ? ` — ${levelLabel(level)}` : ""}`}
              </h2>
            </EmptyTitle>
            <EmptyDescription>
              {reviewedCount > 0 && (
                <>
                  {reviewedCount - lapsedIds.size} recalled
                  {lapsedIds.size > 0 ? ` · ${lapsedIds.size} revisited` : ""}.{" "}
                </>
              )}
              {isAll
                ? "That’s every kanji you’re studying — go again to loop back through."
                : (() => {
                    if (levelPool.length === 0)
                      return "No kanji at this level yet — add words with kanji of this level, or pick a broader level.";
                    const next = nextDueAt(levelPool, now);
                    return next != null
                      ? `Next review ${formatUntil(next - now)}.`
                      : "Add more words to keep studying.";
                  })()}
            </EmptyDescription>
          </EmptyHeader>
          {/* Nothing to go again through at this level — the copy above points
              to another level instead. aria-disabled, not disabled: the last
              grade is still saving when this screen appears, and focus is
              moved here — a disabled button can't take it. restart() ignores
              a press until the save lands. */}
          {levelPool.length > 0 && (
            <Button
              ref={endActionRef}
              variant="outline"
              onClick={restart}
              aria-disabled={sessionLocked || undefined}
              className="aria-disabled:opacity-50"
            >
              <RotateCcw data-icon="inline-start" aria-hidden /> Study again
            </Button>
          )}
        </Empty>
      ) : (
        <>
          {/* Everything inside the card button is a <span> (a button may only
              hold phrasing content); the live region above speaks the faces,
              and aria-describedby lets the focused card read its current face. */}
          <button
            ref={cardRef}
            type="button"
            onClick={() => flip()}
            disabled={reviewBlocked}
            aria-label={flipped ? "Show word" : "Show reading"}
            aria-describedby={faceId}
            aria-keyshortcuts={flipped ? "Space" : "Space Enter"}
            className="group block w-full rounded-xl outline-hidden"
          >
            {/* `study-card` (globals.css) fixes the size for every deck. */}
            <Card
              asChild
              className="study-card relative shrink-0 cursor-pointer px-5 py-5 text-center transition-[color,box-shadow,border-color] select-none group-hover:border-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background sm:px-6 sm:py-6"
            >
              <span>
                {!flipped ? (
                  <span
                    id={faceId}
                    className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] items-center gap-3"
                  >
                    <span className="flex min-h-0 items-center-safe justify-center overflow-y-auto">
                      <span
                        lang="ja"
                        translate="no"
                        className={cn(
                          "jp block max-w-full font-medium break-words",
                          // Furigana adds a line box under every annotated run,
                          // so the ruby face gets the denser step of the same
                          // scale and room to breathe between lines.
                          isAll ? "furigana-under leading-[1.6]" : "leading-tight",
                          promptTextSize(card.word, { dense: isAll })
                        )}
                      >
                        {isAll ? (
                          <WordWithReadingHints
                            word={card.word}
                            char={card.character}
                            parts={card.word_prompt_parts}
                          />
                        ) : (
                          <WordWithFocus word={card.word} char={card.character} />
                        )}
                      </span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      Reading of{" "}
                      <span lang="ja" translate="no" className="jp text-data">{card.character}</span> here?
                    </span>
                  </span>
                ) : (
                  // The reading is pinned at the top; meaning + per-kanji notes
                  // scroll beneath it, so a word with four kanji fills exactly the
                  // same card as a word with one (↑/↓ scroll them by keyboard).
                  <span id={faceId} className="flex h-full w-full flex-col gap-2">
                    <span className="block shrink-0 space-y-0.5">
                      {/* Full reading of the word, dotted at kanji boundaries: 行く → い.く */}
                      <span
                        lang="ja"
                        translate="no"
                        className={cn(
                          "jp block leading-tight font-medium break-words",
                          readingTextSize(wordReading || "—")
                        )}
                      >
                        {wordReading || "—"}
                      </span>
                      {wordRomaji && (
                        <span className="block text-sm leading-tight break-words text-muted-foreground sm:text-base">
                          {wordRomaji}
                        </span>
                      )}
                      <span lang="ja" translate="no" className="jp block text-xs break-words text-muted-foreground sm:text-sm">
                        {card.word}
                      </span>
                    </span>

                    <span
                      ref={answerRef}
                      className="block min-h-0 w-full flex-1 space-y-2 overflow-y-auto pr-1"
                    >
                      <span className="block text-sm leading-snug break-words sm:text-base">
                        {card.word_meaning || "—"}
                      </span>
                      <SentenceNote sentence={card.word_sentence} />
                      <span className="grid gap-2">
                        {currentWordKanji.map((character) => {
                          const kanjiInfo = info[character];
                          const readings = kanjiInfo
                            ? compactReadings([...kanjiInfo.on, ...kanjiInfo.kun])
                            : "";
                          const meanings = kanjiInfo?.meanings.slice(0, 4).join(", ");
                          return (
                            <span
                              key={character}
                              className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/70 bg-background/45 px-2 py-1.5 text-left"
                            >
                              <span lang="ja" translate="no" className="jp block text-center text-xl leading-none text-data sm:text-2xl">
                                {character}
                              </span>
                              <span className="block min-w-0 space-y-0.5">
                                <span className="block text-xs leading-tight break-words text-muted-foreground">
                                  {readings ||
                                  (infoFailed.has(character)
                                    ? "Details unavailable"
                                    : "Reading loading…")}
                                </span>
                                <span className="block text-xs leading-snug break-words sm:text-sm">
                                  {meanings ||
                                  (infoFailed.has(character)
                                    ? "Couldn’t reach the kanji dictionary — it retries next time this kanji comes up."
                                    : "Meaning loading…")}
                                </span>
                              </span>
                            </span>
                          );
                        })}
                      </span>
                    </span>
                  </span>
                )}
              </span>
            </Card>
          </button>

          {!flipped ? (
            <div className="flex flex-col items-center gap-2">
              {/* Each grade swaps in the next card's buttons under the pointer, so
                  the second click of a double-click would grade a card you never
                  saw. e.detail counts the clicks; keyboard presses report 0. */}
              <Button
                size="lg"
                className="w-full max-w-xs"
                onClick={(e) => {
                  if (e.detail > 1) return;
                  grade("remember");
                }}
                disabled={reviewBlocked}
                aria-keyshortcuts="R"
              >
                <Check data-icon="inline-start" aria-hidden /> I remember
              </Button>
              <p className="text-xs text-muted-foreground">
                Not sure? <span className="pointer-fine:hidden">Tap</span>
                <span className="hidden pointer-fine:inline">Flip</span> the
                card to reveal the reading
                <span className="hidden pointer-fine:inline">
                  {" "}
                  · <kbd>R</kbd> remembers it
                </span>
                .
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="grid w-full max-w-xs grid-cols-2 gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => {
                    if (e.detail > 1) return; // see "I remember"
                    grade("wrong");
                  }}
                  disabled={reviewBlocked}
                  aria-keyshortcuts="ArrowLeft 1"
                >
                  <X data-icon="inline-start" aria-hidden /> Forgot
                </Button>
                <Button
                  size="lg"
                  onClick={(e) => {
                    if (e.detail > 1) return;
                    grade("right");
                  }}
                  disabled={reviewBlocked}
                  aria-keyshortcuts="ArrowRight 2"
                >
                  <Check data-icon="inline-start" aria-hidden /> Got it
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                “Got it” if you knew the reading · “Forgot” to see it again soon
                <span className="hidden pointer-fine:inline">
                  {" "}
                  (<kbd>→</kbd> / <kbd>←</kbd>)
                </span>
              </p>
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5">
            <SessionStrip done={done} total={sessionTotal} />
            <span className="text-xs text-muted-foreground tabular-nums">
              {done} of {sessionTotal} done
            </span>
          </div>

          {cardWord && (
            <div className="flex items-center justify-center">
              <Button
                variant="ghost"
                size="icon-lg"
                onClick={() => setEditing(cardWord)}
                disabled={reviewBlocked}
                aria-label={`Edit ${cardWord.kanji}`}
              >
                <Pencil aria-hidden />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Fix the source word without leaving the session. */}
      <EditVocabDialog
        word={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          onVocabChanged?.(updated);
          void refreshAfterEdit();
        }}
      />

      <ConfirmDialog
        open={pendingReset !== null}
        title="Restart this session?"
        description={`You’re ${reviewedCount} of ${sessionTotal} cards in. Your grades are saved — only this run’s progress starts over.`}
        confirmLabel="Restart session"
        cancelLabel="Keep studying"
        onConfirm={() => {
          pendingReset?.();
          setPendingReset(null);
        }}
        onCancel={() => setPendingReset(null)}
      />
    </div>
  );
}
