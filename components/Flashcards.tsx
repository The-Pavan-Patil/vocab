"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import {
  Check,
  Clock,
  Layers,
  Lightbulb,
  Pencil,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  type Grade,
  type Vocab,
  type VocabLoadState,
} from "@/lib/types";
import {
  NEW_CARDS_PER_SESSION,
  RELEARN_GAP,
  SESSION_SIZE_OPTIONS,
  buildSession,
  isEarly,
  isNew,
  nextDueAt,
} from "@/lib/srs";
import { deckCard, type StudyMode } from "@/lib/decks";
import { shouldIgnoreDeckKey } from "@/lib/deck-keys";
import { answerTextSize, promptTextSize } from "@/lib/card-fit";
import { formatUntil } from "@/lib/relative-time";
import { cn } from "@/lib/utils";
import { reviewVocab } from "@/lib/api";
import { createReviewId } from "@/lib/review-command";
import { useReviewOutbox } from "@/hooks/use-review-outbox";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import EditVocabDialog from "@/components/EditVocabDialog";
import SentenceNote from "@/components/SentenceNote";
import ConfirmDialog from "@/components/ConfirmDialog";
import ScreenHeader from "@/components/ScreenHeader";
import SessionStrip from "@/components/SessionStrip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
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

const byCategory = (list: Vocab[], cat: string) =>
  cat === "all" ? list : list.filter((v) => v.category === cat);

// Same words, possibly different content — see the session rebuild below.
function sameCards(a: Vocab[], b: Vocab[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((item) => item.id));
  return b.every((item) => ids.has(item.id));
}

type VocabReviewCommand = {
  reviewId: string;
  cardId: string;
  grade: Grade;
  practice: boolean;
  mode: StudyMode;
};

// What the screen reader hears after a grade, ahead of the next card.
const GRADE_SPOKEN: Record<Grade, string> = {
  remember: "Remembered",
  right: "Got it",
  wrong: "Forgot — it comes back later this session",
};

// `vocab` arrives already projected for `mode` (the page maps kanji rows through
// deckCard), so all the session logic below reads the right deck's schedule. The
// only mode-specific behavior here is the card faces, the localStorage key, the
// review `mode`, and re-projecting the server's response after a grade.
export default function Flashcards({
  vocab,
  mode = "word",
  loadState = "ready",
  loadedAt = 0,
  heading,
  onVocabChanged,
}: {
  vocab: Vocab[];
  mode?: StudyMode;
  // The screen's h1 when this deck is a tab of its own. The Kanji tab names
  // itself, so its decks render only the session line under its title.
  heading?: string;
  // The parent's fetch of `vocab`: an empty list only means "no words" once
  // it's "ready". `loadedAt` is when that list arrived (0 = not yet).
  loadState?: VocabLoadState;
  loadedAt?: number;
  // Told about a word edited from inside a session, so the rest of the app can
  // catch up without this component reloading (and restarting the session).
  onVocabChanged?: (updated: Vocab) => void;
}) {
  const isKanji = mode === "kanji";
  const [category, setCategory] = useState<string>("all");
  const [sessionId, setSessionId] = useState(0); // bump to (re)start a session
  // "Study again" / restart re-studies cards we just pushed into the future — a
  // cram pass that ignores due dates so the user can go again immediately, not
  // tomorrow. A normal (re)build (mount, category switch, parent reload) still
  // respects the schedule. restart() sets this; the rebuild below reads it.
  const [cram, setCram] = useState(false);
  // Session "clock": React purity forbids Date.now() during render, so we read
  // the current time once when a session starts and keep it in state.
  const [now, setNow] = useState(() => Date.now());
  // How many never-seen cards to introduce per session (20 / 50 / 100 / All).
  // User-configurable, persisted per browser; loaded from localStorage on mount
  // (effect below, not a lazy initializer, to avoid an SSR/hydration mismatch).
  const [newLimit, setNewLimit] = useState<number>(NEW_CARDS_PER_SESSION);

  // Local working copy of the vocab. Reviews update due dates here so a *new*
  // session (Study again) correctly excludes cards we just pushed into the
  // future — without forcing a full reload of the parent's list mid-session.
  const [cards, setCards] = useState<Vocab[]>(vocab);
  const [prevVocab, setPrevVocab] = useState(vocab);

  const [remaining, setRemaining] = useState<Vocab[]>(() =>
    buildSession(byCategory(vocab, "all"), Date.now())
  );
  // Distinct-card session accounting: a stable progress denominator and an
  // honest recap that doesn't double-count a card you forgot then recalled.
  const [sessionTotal, setSessionTotal] = useState(() => remaining.length);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [lapsedIds, setLapsedIds] = useState<Set<string>>(() => new Set());
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  // The last grade, spoken ahead of the next card (cleared by a flip).
  const [lastGrade, setLastGrade] = useState<Grade | null>(null);
  // The card currently open in the edit dialog (null = closed).
  const [editing, setEditing] = useState<Vocab | null>(null);
  const interactionHandledRef = useRef(false);
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
  // A restart / category / size change waiting on "restart this session?".
  const [pendingReset, setPendingReset] = useState<(() => void) | null>(null);

  function flip(next?: boolean) {
    setFlipped((f) => next ?? !f);
    setLastGrade(null);
  }

  const sendReview = useCallback(
    (command: VocabReviewCommand) =>
      reviewVocab(command.cardId, command.grade, {
        reviewId: command.reviewId,
        practice: command.practice,
        mode: command.mode,
      }),
    []
  );
  const applySavedReview = useCallback(
    (updated: Vocab) => {
      // Re-project the raw server row for this deck so our working copy keeps
      // reading the right schedule (no-op for the word deck).
      const projected = deckCard(updated, mode);
      setCards((current) =>
        current.map((item) =>
          item.id === projected.id ? projected : item
        )
      );
    },
    [mode]
  );
  const reviewOutbox = useReviewOutbox<VocabReviewCommand, Vocab>({
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

  // A ref closes the tiny same-render window where a fast double-click could
  // enqueue the same visible card twice. The next render represents a new card
  // interaction and unlocks the ref.
  useLayoutEffect(() => {
    interactionHandledRef.current = false;
  });

  // Load the saved category and session size once on mount. The first render
  // already used the defaults, so applying the stored values here is a safe
  // post-hydration update (no SSR mismatch), not derived render state.
  // Deck settings are per-browser study preferences, so they live in
  // localStorage rather than the URL (which carries the tab and searches).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedCategory = window.localStorage.getItem(`vocab:category:${mode}`);
    if (
      savedCategory &&
      (savedCategory === "all" || CATEGORIES.includes(savedCategory as never))
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategory(savedCategory);
    }
    const raw = window.localStorage.getItem(`vocab:sessionSize:${mode}`);
    if (raw == null) return;
    const parsed = raw === "all" ? Infinity : Number(raw);
    if (parsed !== Infinity && !Number.isFinite(parsed)) return;
    setNewLimit(parsed);
  }, [mode]);

  // (Re)build the session whenever the category, session id, or chosen size
  // changes. New identity on any dep change → triggers the render-time reset
  // below (the repo's "you might not need an effect" pattern).
  const sessionToken = useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, sessionId, newLimit]
  );
  const [prevToken, setPrevToken] = useState(sessionToken);
  const vocabChanged = prevVocab !== vocab;
  // A new list carrying the SAME cards is an edit, not a new deck — someone
  // fixed a word (maybe the card on screen) from the edit dialog. Swapping the
  // card objects into the live queue keeps the queue order, the progress bar,
  // and the reviewed/lapsed tallies; only a membership change (a word added or
  // deleted elsewhere) is worth restarting the session over.
  const editedInPlace = vocabChanged && sameCards(prevVocab, vocab);
  if (vocabChanged) {
    setPrevVocab(vocab);
    setCards(vocab);
    if (editedInPlace) {
      const byId = new Map(vocab.map((item) => [item.id, item]));
      setRemaining((queue) => queue.map((item) => byId.get(item.id) ?? item));
    }
  }
  if (prevToken !== sessionToken || (vocabChanged && !editedInPlace)) {
    setPrevToken(sessionToken);
    // When the parent reloads its list, resync our working copy and study the
    // fresh data; otherwise keep our locally-updated schedules.
    const source = vocabChanged ? vocab : cards;
    // The panel stays mounted, so a reload can land hours after our clock was
    // read: study the fresh list as of when it was fetched, so cards that came
    // due in the meantime are in.
    const clock = vocabChanged ? Math.max(now, loadedAt) : now;
    setNow(clock);
    // A parent reload always restudies the fresh due data (never a cram);
    // restart() sets `cram` to re-include cards we just scheduled ahead.
    const nextQueue = buildSession(byCategory(source, category), clock, {
      newLimit,
      cram: cram && !vocabChanged,
    });
    setRemaining(nextQueue);
    setSessionTotal(nextQueue.length);
    setCram(false);
    setReviewedIds(new Set());
    setLapsedIds(new Set());
    setFlipped(false);
    setShowHint(false);
    setLastGrade(null);
  }

  const card = remaining[0];
  const reviewedCount = reviewedIds.size; // distinct cards graded this session
  const done = sessionTotal - remaining.length; // cards cleared from the queue

  // (Re)start a session against the latest schedules / a fresh clock. Runs in an
  // event handler, so reading Date.now() here is allowed.
  function restart() {
    if (sessionLocked) return;
    refocusRef.current = true; // "Study again" unmounts with the end screen
    setNow(Date.now());
    setCram(true); // re-study now, ignoring due dates (see buildSession cram)
    setSessionId((n) => n + 1);
  }
  function changeCategory(next: string) {
    if (sessionLocked) return;
    window.localStorage.setItem(`vocab:category:${mode}`, next);
    setNow(Date.now());
    setCategory(next);
  }
  // Change the per-session new-card cap and remember it for next time. The
  // sessionToken dep on `newLimit` rebuilds the queue.
  function changeSessionSize(next: number) {
    if (sessionLocked) return;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        `vocab:sessionSize:${mode}`,
        Number.isFinite(next) ? String(next) : "all"
      );
    }
    setNow(Date.now());
    setNewLimit(next);
  }

  // Restarting, or switching category / size, rebuilds the queue. Before the
  // first grade or after the last that's free, but mid-session it throws away
  // the run's progress (the grades themselves are already saved) — so ask.
  function guardReset(run: () => void) {
    if (reviewedCount > 0 && remaining.length > 0) setPendingReset(() => run);
    else run();
  }

  // New cards in this category that aren't already in the queue — the pool we
  // can pull from to grow the session past the initial new-card cap.
  const queuedIds = new Set(remaining.map((c) => c.id));
  const availableNew = byCategory(cards, category).filter(
    (c) => isNew(c) && !queuedIds.has(c.id)
  ).length;
  // Size of the next "Add more" batch — `availableNew` when the size is "All".
  const moreBatch = Number.isFinite(newLimit)
    ? Math.min(newLimit, availableNew)
    : availableNew;

  // Pull the next batch of new cards into the live queue — grows the current
  // run ("increase the session"), or resumes after finishing ("keep going").
  // Oldest-added first, matching buildSession, so old words aren't starved.
  function addMore() {
    if (sessionLocked) return;
    const more = byCategory(cards, category)
      .filter((c) => isNew(c) && !queuedIds.has(c.id))
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .slice(0, newLimit);
    if (more.length === 0) return;
    refocusRef.current = true; // "Study N more" unmounts with the end screen
    setLastGrade(null);
    setRemaining((r) => [...r, ...more]);
    setSessionTotal((t) => t + more.length);
  }

  // Grade the current card. Advances optimistically (snappy), then persists in
  // the background — the server is the source of truth for the next interval.
  function grade(g: Grade) {
    const cur = remaining[0];
    if (!cur || reviewBlocked || interactionHandledRef.current) return;
    interactionHandledRef.current = true;
    // Reviewing a card before it's due (only reachable while cramming) is a
    // practice rep: the server logs it but leaves the schedule untouched, so
    // cramming can't inflate intervals.
    const practice = isEarly(cur, Date.now());
    const accepted = reviewOutbox.enqueue({
      reviewId: createReviewId(),
      cardId: cur.id,
      grade: g,
      practice,
      mode,
    });
    if (!accepted) {
      interactionHandledRef.current = false;
      return;
    }

    setReviewedIds((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
    if (g === "wrong") {
      setLapsedIds((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
    }
    refocusRef.current = true;
    setLastGrade(g);
    setFlipped(false);
    setShowHint(false);
    const rest = remaining.slice(1);
    if (g === "wrong") {
      // Lapse: bring it back later in this same session so it's drilled until
      // it sticks (within-session "learning step"), in addition to its
      // server-side due date.
      const at = Math.min(RELEARN_GAP, rest.length);
      rest.splice(at, 0, cur);
    }
    // The run is over: measure the end screen's "Next review in …" from now,
    // not from when the session started.
    if (rest.length === 0) setNow(Date.now());
    setRemaining(rest);
  }

  // A grade unmounts the button that was pressed (Forgot / Got it swap back to
  // "I remember", or the caught-up screen replaces the card). Rather than
  // letting focus fall to <body>, hand it to the card — or to the end screen's
  // action once the queue is empty. A focus that survived is left alone.
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
  // Forgot, →/2 = Got it, Space flips back, ↑/↓ scroll a long answer while the
  // card has focus. H toggles the Marathi hint. Keys that belong to another
  // control (see shouldIgnoreDeckKey) are left alone.
  // Re-binds on flip / queue change so the closure over `grade` stays fresh.
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
      if (e.key === "h" || e.key === "H") {
        setShowHint((s) => !s);
        return;
      }
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

  const categoryCount = byCategory(cards, category).length;

  // One polite live region for the whole deck: the next card (after the last
  // grade), the full answer on a flip, and the recap when the queue empties.
  // The card button's own name stays short; this carries the content.
  let announcement = "";
  if (categoryCount > 0 && card && !flipped) {
    announcement = [
      lastGrade && GRADE_SPOKEN[lastGrade],
      `Word: ${card.kanji}${!isKanji && card.romaji ? `, ${card.romaji}` : ""}`,
      `${remaining.length} left in this session`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (categoryCount > 0 && card) {
    announcement = [
      isKanji && card.romaji && `Reading: ${card.romaji}`,
      `Meaning: ${card.english || "no English meaning"}`,
      card.category && `Category: ${card.category}`,
      card.tips?.trim() && `Marathi: ${card.tips}`,
      card.sentence?.trim() && `Sentence: ${card.sentence}`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (categoryCount > 0 && reviewedCount > 0) {
    announcement = `${lastGrade ? `${GRADE_SPOKEN[lastGrade]}. ` : ""}Session complete. ${reviewedCount - lapsedIds.size} recalled${lapsedIds.size > 0 ? `, ${lapsedIds.size} revisited` : ""}.`;
  }

  // The screen's one question — what's left, and of what kind — answered under
  // its title, and kept in step with the strip below the card.
  const dueLeft = remaining.filter((c) => !isNew(c)).length;
  const sessionLine = card
    ? `${remaining.length} left in this session · ${dueLeft} due, ${remaining.length - dueLeft} new`
    : null;
  const header = (line: string | null) =>
    heading ? (
      <ScreenHeader title={heading}>{line}</ScreenHeader>
    ) : line ? (
      <p className="text-sm text-muted-foreground tabular-nums">{line}</p>
    ) : null;

  if (vocab.length === 0 && loadState === "loading") {
    // Hold the card's footprint so the deck doesn't jump in when it arrives.
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {header(null)}
        <Skeleton className="study-card rounded-xl" aria-hidden />
        <span className="sr-only" role="status">
          Loading cards…
        </span>
      </div>
    );
  }

  // The page's own alert explains a failed load (with a Retry); an empty state
  // here would wrongly say there's nothing to study.
  if (vocab.length === 0 && loadState === "failed") return header(null);

  if (vocab.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        {header(null)}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>{isKanji ? "No kanji yet" : "No flashcards yet"}</EmptyTitle>
            <EmptyDescription>
              {isKanji
                ? "Turn on “Also study as Kanji” on a word (Add, Dictionary, or the List tab) to drill it here as a kanji-only card."
                : "Add a few words first, then come back here to revise them."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>

      {header(sessionLine)}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={category}
            onValueChange={(next) => guardReset(() => changeCategory(next))}
            // Not disabled while a save is in flight — that's ~200ms after
            // every grade, and the dimming flickers. The change handlers (here,
            // and on the size, Add more and Restart controls) ignore that window.
            disabled={reviewBlocked}
          >
            <SelectTrigger className="w-40" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Select
            value={Number.isFinite(newLimit) ? String(newLimit) : "all"}
            onValueChange={(v) =>
              guardReset(() =>
                changeSessionSize(v === "all" ? Infinity : Number(v))
              )
            }
            disabled={reviewBlocked}
          >
            <SelectTrigger className="w-36" aria-label="New cards per session">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SESSION_SIZE_OPTIONS.map((n) => (
                  <SelectItem
                    key={String(n)}
                    value={Number.isFinite(n) ? String(n) : "all"}
                  >
                    {Number.isFinite(n) ? `${n} / session` : "All new cards"}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          {slowSave && !reviewError && (
            <Badge variant="outline">
              <Spinner data-icon="inline-start" aria-hidden /> Saving{" "}
              <span className="tabular-nums">{reviewOutbox.pendingCount}</span>…
            </Badge>
          )}
        </div>
      </div>

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

      {categoryCount === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No cards in this category</EmptyTitle>
            <EmptyDescription>
              Pick another category or add more words.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !card ? (
        // Queue is empty: either we just finished a run, or nothing is due yet.
        <CaughtUp
          reviewed={reviewedCount}
          revisited={lapsedIds.size}
          nextInMs={(() => {
            const next = nextDueAt(byCategory(cards, category), now);
            return next == null ? null : next - now;
          })()}
          availableNew={availableNew}
          moreBatch={moreBatch}
          onRestart={restart}
          onStudyMore={addMore}
          busy={sessionLocked}
          actionRef={endActionRef}
        />
      ) : (
        <>
          {/* Study surface — tap anywhere on the card to flip. Everything inside
              is a <span> (a button may only hold phrasing content); the live
              region above speaks the faces, and aria-describedby lets the
              focused card read its current face. */}
          <button
            ref={cardRef}
            type="button"
            onClick={() => flip()}
            disabled={reviewBlocked}
            aria-label={flipped ? "Show word" : "Show answer"}
            aria-describedby={faceId}
            aria-keyshortcuts={flipped ? "Space" : "Space Enter"}
            className="group block w-full rounded-xl outline-hidden"
          >
            {/* `study-card` (globals.css) fixes the size for every deck. */}
            <Card
              asChild
              className="study-card relative flex shrink-0 cursor-pointer flex-col px-6 text-center transition-[color,box-shadow,border-color] select-none group-hover:border-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background"
            >
              <span>
                {!flipped ? (
                  // Front: prompt fills the free space, "tap to flip" pinned low.
                  <span
                    id={faceId}
                    className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-2"
                  >
                    <span className="flex min-h-0 flex-col items-center justify-center-safe gap-2 overflow-y-auto">
                      <span
                        lang="ja"
                        translate="no"
                        className={cn(
                          "jp block w-full leading-tight font-medium break-words",
                          promptTextSize(card.kanji)
                        )}
                      >
                        {card.kanji}
                      </span>
                      {/* Word deck shows the reading up front; the Kanji deck hides
                          it — recalling the reading from the glyph is the whole task. */}
                      {!isKanji && card.romaji && (
                        <span className="block w-full text-lg break-words text-muted-foreground sm:text-xl">
                          {card.romaji}
                        </span>
                      )}
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      <span className="pointer-fine:hidden">Tap to flip</span>
                      <span className="hidden pointer-fine:inline">
                        Click or press Space to flip
                      </span>
                    </span>
                  </span>
                ) : (
                  // Back: reading (kanji deck) and the source word are pinned; the
                  // answer block between them scrolls if the meaning + tip run long,
                  // so the card itself never has to grow (↑/↓ scroll it by keyboard).
                  <span id={faceId} className="flex h-full w-full flex-col gap-2">
                    {/* Kanji deck reveals the reading too (recall reading + meaning). */}
                    {isKanji && card.romaji && (
                      <span lang="ja" translate="no" className="jp block shrink-0 text-xl leading-tight font-medium break-words text-muted-foreground sm:text-2xl">
                        {card.romaji}
                      </span>
                    )}
                    <span
                      ref={answerRef}
                      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center-safe gap-2 overflow-y-auto"
                    >
                      <span
                        className={cn(
                          "block w-full leading-tight font-medium break-words",
                          answerTextSize(card.english || "—")
                        )}
                      >
                        {card.english || "—"}
                      </span>
                      {card.category && (
                        <Badge variant="secondary">{card.category}</Badge>
                      )}
                      {/* The Marathi tip rides along with the answer — reading the
                          meaning and its mnemonic together is the point of the flip. */}
                      {card.tips?.trim() && (
                        <span className="block w-full rounded-lg bg-muted px-3 py-1.5">
                          <span className="mr-1.5 text-xs text-muted-foreground">
                            Marathi
                          </span>
                          <span lang="mr" className="text-sm break-words sm:text-base">
                            {card.tips}
                          </span>
                        </span>
                      )}
                      {/* The word in context, last on the answer — you read the
                          meaning first, then see it used. */}
                      <SentenceNote sentence={card.sentence} />
                    </span>
                    <span lang="ja" translate="no" className="jp block shrink-0 truncate text-sm text-muted-foreground">
                      {card.kanji}
                    </span>
                  </span>
                )}
              </span>
            </Card>
          </button>

          {/* Grade buttons. Front: a single confident "Remember". Flipped: the
              Forgot / Got-it split — so a flip done just to confirm (Got it)
              counts as a pass, while a real lapse (Forgot) reschedules soon. */}
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
                card to reveal the meaning
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
                “Got it” if you actually knew it · “Forgot” to see it again soon
                <span className="hidden pointer-fine:inline">
                  {" "}
                  (<kbd>→</kbd> / <kbd>←</kbd>)
                </span>
              </p>
            </div>
          )}

          {/* Progress: how far through the current session. */}
          <div className="flex flex-col items-center gap-1.5">
            <SessionStrip done={done} total={sessionTotal} />
            <span className="text-xs text-muted-foreground tabular-nums">
              {done} of {sessionTotal} done
            </span>
            {availableNew > 0 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto min-h-6 px-1.5 py-1 text-xs"
                onClick={addMore}
                disabled={reviewBlocked}
              >
                Add {moreBatch} more · {availableNew} new waiting
              </Button>
            )}
          </div>

          {/* Controls: restart the session · toggle the Marathi hint. */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => guardReset(restart)}
              disabled={reviewBlocked}
              aria-label="Restart session"
            >
              <RotateCcw aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setEditing(card)}
              disabled={reviewBlocked}
              aria-label={`Edit ${card.kanji}`}
            >
              <Pencil aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setShowHint((s) => !s)}
              disabled={reviewBlocked}
              aria-pressed={showHint}
              aria-keyshortcuts="H"
              aria-label="Marathi hint"
              className="aria-pressed:bg-muted aria-pressed:text-foreground"
            >
              <Lightbulb aria-hidden />
            </Button>
          </div>

          {/* Hint panel: on the flipped face the tip already rides under the
              answer, so only fall back to the panel when there's none to show.
              The live region stays mounted so the hint is read out when it
              appears (button or H). */}
          <div aria-live="polite">
            {showHint && (!flipped || !card.tips?.trim()) && (
              <div className="rounded-xl bg-muted px-4 py-3 text-center">
                <span className="mr-2 text-sm text-muted-foreground">
                  Marathi
                </span>
                <span lang={card.tips ? "mr" : undefined} className="text-lg break-words">
                  {card.tips || "No tip added."}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Fix a word without leaving the session: the saved row is swapped into
          the live queue, so the card on screen updates in place. */}
      <EditVocabDialog
        word={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          const projected = deckCard(updated, mode);
          setCards((current) =>
            current.map((item) => (item.id === projected.id ? projected : item))
          );
          setRemaining((queue) =>
            queue.map((item) => (item.id === projected.id ? projected : item))
          );
          onVocabChanged?.(updated);
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

// Shown when the session queue empties — either a finished run (with a recap)
// or "nothing due yet" with the time until the next review.
function CaughtUp({
  reviewed,
  revisited,
  nextInMs,
  availableNew,
  moreBatch,
  onRestart,
  onStudyMore,
  busy,
  actionRef,
}: {
  reviewed: number;
  revisited: number;
  nextInMs: number | null;
  availableNew: number;
  moreBatch: number;
  onRestart: () => void;
  onStudyMore: () => void;
  busy: boolean;
  // Focus lands here when the last card is graded (see the refocus effect).
  actionRef?: Ref<HTMLButtonElement>;
}) {
  const finished = reviewed > 0;
  const recalled = reviewed - revisited; // cards cleared without a lapse
  return (
    <Empty className="mx-auto max-w-xl">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          {finished ? <Sparkles /> : <Clock />}
        </EmptyMedia>
        <EmptyTitle>
          <h2>{finished ? "Session complete" : "All caught up"}</h2>
        </EmptyTitle>
        <EmptyDescription>
          {finished && (
            <>
              {recalled} recalled
              {revisited > 0 ? ` · ${revisited} revisited` : ""}.{" "}
            </>
          )}
          {availableNew > 0 ? (
            <>
              <span className="tabular-nums">{availableNew}</span> new card
              {availableNew === 1 ? "" : "s"} still waiting.
            </>
          ) : nextInMs != null ? (
            <>Next review {formatUntil(nextInMs)}.</>
          ) : (
            <>Add more words to keep studying.</>
          )}
        </EmptyDescription>
      </EmptyHeader>
      {/* aria-disabled, not disabled: the last grade is still saving when
          this screen appears, and focus is moved here — a disabled button
          can't take it. onStudyMore / onRestart ignore a press until it lands. */}
      {availableNew > 0 ? (
        <Button
          ref={actionRef}
          onClick={onStudyMore}
          aria-disabled={busy || undefined}
          className="aria-disabled:opacity-50"
        >
          <Sparkles data-icon="inline-start" aria-hidden /> Study {moreBatch} more
        </Button>
      ) : (
        <Button
          ref={actionRef}
          variant="outline"
          onClick={onRestart}
          aria-disabled={busy || undefined}
          className="aria-disabled:opacity-50"
        >
          <RotateCcw data-icon="inline-start" aria-hidden /> Study again
        </Button>
      )}
    </Empty>
  );
}
