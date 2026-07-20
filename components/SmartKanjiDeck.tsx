"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Check, Clock, Languages, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import type { KanjiCard, KanjiInfo, KanjiPromptPart } from "@/lib/types";
import {
  NEW_CARDS_PER_SESSION,
  RELEARN_GAP,
  SESSION_SIZE_OPTIONS,
  buildSession,
  isEarly,
  nextDueAt,
} from "@/lib/srs";
import {
  ALL_LEVELS,
  JLPT_LEVELS,
  groupByKanji,
  levelLabel,
  matchesLevel,
  refreshQueuedKanjiCards,
} from "@/lib/kanji-deck";
import { fetchKanji, fetchKanjiCards, reviewKanjiCard, syncKanjiCards } from "@/lib/api";
import { createReviewId } from "@/lib/review-command";
import { cn } from "@/lib/utils";
import { useReviewOutbox } from "@/hooks/use-review-outbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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

function humanizeUntil(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

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

type KanjiReviewCommand = {
  reviewId: string;
  cardId: string;
  grade: "remember" | "right" | "wrong";
  practice: boolean;
};

// The word with the target kanji emphasized — "what reading does THIS take here?"
function WordWithFocus({ word, char }: { word: string; char: string }) {
  return <FocusedSurface surface={word} char={char} />;
}

function FocusedSurface({ surface, char }: { surface: string; char: string }) {
  return [...surface].map((character, index) => (
    <span
      key={index}
      className={cn(
        "text-muted-foreground/70",
        character === char && "text-primary"
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
    const surface = <FocusedSurface surface={part.surface} char={char} />;
    return part.reading ? (
      <ruby key={index}>
        {surface}
        <rp>(</rp>
        <rt className="text-base leading-none font-normal text-muted-foreground sm:text-lg">
          {part.reading}
        </rt>
        <rp>)</rp>
      </ruby>
    ) : (
      <span key={index}>{surface}</span>
    );
  });
}

export default function SmartKanjiDeck({
  active = true,
  variant = "smart",
}: {
  active?: boolean;
  variant?: "smart" | "all";
}) {
  // "all" = the ungated "All Kanjis" review: every card, no JLPT/due filter,
  // newest word first, grouped so the same kanji's words run consecutively.
  const isAll = variant === "all";
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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Record<string, KanjiInfo>>({});

  // Refs let async refreshes reconcile the latest cache/queue without making
  // either one a dependency that implicitly restarts the current session.
  const initializedRef = useRef(false);
  const syncedRef = useRef(false);
  const interactionHandledRef = useRef(false);
  const cardsRef = useRef<KanjiCard[]>([]);
  const remainingRef = useRef<KanjiCard[]>([]);

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
    setError(null);
  }

  // Restore saved controls before the first queue is built. Waiting for this
  // client-only step avoids briefly starting a default N5/100-card session and
  // then resetting it when localStorage is applied.
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
        syncError = `Deck reconciliation failed: ${(e as Error).message}`;
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
  }, [active, preferencesReady, isAll]);

  const card = remaining[0];
  const reviewedCount = reviewedIds.size;
  const done = sessionTotal - remaining.length;
  const currentChar = card?.character;

  // Lazily enrich the back of the current card with kanjiapi data.
  useEffect(() => {
    if (!currentChar || info[currentChar]) return;
    let active = true;
    fetchKanji(currentChar)
      .then((k) => active && setInfo((m) => ({ ...m, [currentChar]: k })))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [currentChar, info]);

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
    startSession(cardsRef.current, { cram: true });
  }

  function grade(g: "remember" | "right" | "wrong") {
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
    setFlipped(false);
    const rest = remaining.slice(1);
    if (g === "wrong") rest.splice(Math.min(RELEARN_GAP, rest.length), 0, cur);
    setQueue(rest);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.closest("input, textarea, [contenteditable=true]") ||
          t.closest("[data-slot=select-trigger]") ||
          t.closest("[role=tablist], [data-app-nav]"))
      ) {
        return;
      }
      if (
        remaining.length === 0 ||
        reviewBlocked ||
        interactionHandledRef.current
      )
        return;
      if (!flipped) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          setFlipped(true);
        } else if (e.key === "r" || e.key === "R") {
          e.preventDefault();
          grade("remember");
        }
      } else {
        if (e.key === "ArrowLeft" || e.key === "1") {
          e.preventDefault();
          grade("wrong");
        } else if (e.key === "ArrowRight" || e.key === "2") {
          e.preventDefault();
          grade("right");
        } else if (e.key === " ") {
          e.preventDefault();
          setFlipped(false);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, remaining, reviewBlocked]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-xl items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Loading kanji…
      </div>
    );
  }

  if (allCards.length === 0 && error) {
    return (
      <Alert variant="destructive" className="mx-auto max-w-xl">
        <AlertTitle>Smart Kanji couldn’t load</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (allCards.length === 0) {
    return (
      <Empty className="mx-auto max-w-xl">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Languages />
          </EmptyMedia>
          <EmptyTitle>No smart kanji yet</EmptyTitle>
          <EmptyDescription>
            Turn on “Also study as Kanji” when you add a word. Its JLPT-level kanji
            land here automatically, grouped per kanji with their reading in each word.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const ki = currentChar ? info[currentChar] : undefined;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {isAll ? (
          <span className="text-sm text-muted-foreground">
            All kanji · newest first
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={String(level)}
              onValueChange={(v) => changeLevel(Number(v))}
              disabled={sessionLocked}
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
              onValueChange={(v) => changeSize(v === "all" ? Infinity : Number(v))}
              disabled={sessionLocked}
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
          {reviewOutbox.pendingCount > 0 && !reviewOutbox.error && (
            <Badge variant="outline">
              <Spinner data-icon="inline-start" /> Saving {reviewOutbox.pendingCount}
            </Badge>
          )}
          {reviewedCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {reviewedCount} reviewed
            </span>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Smart Kanji needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {reviewOutbox.error && (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t save that review</AlertTitle>
          <AlertDescription>{reviewOutbox.error}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={reviewOutbox.retry}>
              Retry
            </Button>
          </AlertAction>
        </Alert>
      )}

      {!card ? (
        <Empty className="mx-auto max-w-xl">
          <EmptyHeader>
            <EmptyMedia variant="icon">{reviewedCount > 0 ? <Sparkles /> : <Clock />}</EmptyMedia>
            <EmptyTitle>
              {reviewedCount > 0
                ? "Session complete"
                : isAll
                  ? "All caught up"
                  : `All caught up${level !== ALL_LEVELS ? ` — ${levelLabel(level)}` : ""}`}
            </EmptyTitle>
            <EmptyDescription>
              {reviewedCount > 0 && (
                <>
                  {reviewedCount - lapsedIds.size} recalled
                  {lapsedIds.size > 0 ? ` · ${lapsedIds.size} revisited` : ""}.{" "}
                </>
              )}
              {isAll
                ? "That's every kanji you're studying — go again to loop back through."
                : (() => {
                    const pool = allCards.filter((c) => matchesLevel(c, level));
                    if (pool.length === 0)
                      return "No kanji at this level yet — add words with kanji of this level, or pick a broader level.";
                    const next = nextDueAt(pool, now);
                    return next != null
                      ? `Next review in ${humanizeUntil(next - now)}.`
                      : "Add more words to keep studying.";
                  })()}
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={restart} disabled={sessionLocked}>
            <RotateCcw data-icon="inline-start" aria-hidden /> Study again
          </Button>
        </Empty>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            disabled={reviewBlocked}
            aria-label={flipped ? "Show word" : "Flip to reading"}
            className="block w-full focus-visible:outline-none"
          >
            <Card className="relative flex h-64 cursor-pointer select-none flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center transition-colors hover:border-primary/40 sm:h-80 lg:h-96">
              {!flipped ? (
                <>
                  <div
                    className={cn(
                      "jp text-6xl font-medium break-words sm:text-7xl",
                      isAll ? "leading-[1.5]" : "leading-tight"
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
                  </div>
                  <div className="mt-2 text-xs tracking-wide text-muted-foreground/60 uppercase">
                    Reading of{" "}
                    <span className="jp text-primary">{card.character}</span> here?
                  </div>
                </>
              ) : (
                <>
                  {/* Full reading of the word, dotted at kanji boundaries: 行く → い.く */}
                  <div className="jp text-5xl font-medium sm:text-6xl">
                    {card.word_reading || card.reading || "—"}
                  </div>
                  <div className="jp text-lg text-muted-foreground">{card.word}</div>
                  {card.reading && (
                    <div className="text-sm text-muted-foreground">
                      <span className="jp text-primary">{card.character}</span> ={" "}
                      <span className="jp">{card.reading}</span>
                    </div>
                  )}
                  {card.word_meaning && <div className="text-base">{card.word_meaning}</div>}
                  {ki && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {ki.meanings.slice(0, 3).join(", ")}
                      {ki.on.length > 0 && <span className="jp"> · 音 {ki.on.slice(0, 3).join("、")}</span>}
                      {ki.kun.length > 0 && <span className="jp"> · 訓 {ki.kun.slice(0, 3).join("、")}</span>}
                    </div>
                  )}
                </>
              )}
            </Card>
          </button>

          {!flipped ? (
            <div className="flex flex-col items-center gap-2">
              <Button size="lg" className="w-full max-w-xs" onClick={() => grade("remember")} disabled={reviewBlocked}>
                <Check data-icon="inline-start" aria-hidden /> I remember
              </Button>
              <p className="text-xs text-muted-foreground">Not sure? Tap the card to reveal the reading.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="grid w-full max-w-xs grid-cols-2 gap-2">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => grade("wrong")}
                  disabled={reviewBlocked}
                >
                  <X data-icon="inline-start" aria-hidden /> Forgot
                </Button>
                <Button size="lg" onClick={() => grade("right")} disabled={reviewBlocked}>
                  <Check data-icon="inline-start" aria-hidden /> Got it
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col items-center gap-1.5">
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={sessionTotal}
              aria-valuenow={done}
              aria-label="Session progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${sessionTotal > 0 ? (done / sessionTotal) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {remaining.length} left{isAll ? "" : ` · ${levelLabel(level)}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
