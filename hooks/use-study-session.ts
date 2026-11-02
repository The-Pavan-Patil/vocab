"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { isEarly, isNew, RELEARN_GAP, type Grade } from "@/lib/srs";
import { shouldIgnoreDeckKey } from "@/lib/deck-keys";
import { createReviewId } from "@/lib/review-command";
import { useReviewOutbox } from "@/hooks/use-review-outbox";
import { useBeforeUnload } from "@/hooks/use-before-unload";

// The study MECHANICS every deck shares — the queue, flipping, grading (with an
// in-session relearn of a forgotten card), the background save queue, the
// keyboard, and where focus goes. What a deck studies and how it's scheduled
// stays in the deck: it hands this hook its cards, how to build a queue from
// them, how to send a review, and how to read the saved row back.

/** A review as the deck sends it. `practice` = an early (cram) review. */
export type ReviewCommand = {
  reviewId: string;
  cardId: string;
  grade: Grade;
  practice: boolean;
};

type SessionCard = {
  id: string;
  due_at?: string | null;
  last_reviewed_at?: string | null;
};

// The schedule fields a deck's (projected) card reads.
const SRS_FIELDS = [
  "ease",
  "interval_days",
  "reps",
  "lapses",
  "state",
  "due_at",
  "last_reviewed_at",
] as const;

const reviewedAt = (card: SessionCard) =>
  card.last_reviewed_at ? Date.parse(card.last_reviewed_at) : 0;

// Fresh data from the parent can predate this session's saved reviews (the
// page's word list isn't refetched per grade). Keep whichever schedule is
// newer, so an edit elsewhere can't bring a just-reviewed card back as due.
function withSaved<C extends SessionCard>(cards: C[], saved: Map<string, C>): C[] {
  if (saved.size === 0) return cards;
  return cards.map((card) => {
    const mine = saved.get(card.id);
    if (!mine || reviewedAt(mine) <= reviewedAt(card)) return card;
    const schedule: Record<string, unknown> = {};
    for (const field of SRS_FIELDS) {
      if (field in mine) schedule[field] = mine[field as keyof C];
    }
    return { ...card, ...schedule };
  });
}

// Same cards, possibly different content — an edit or a refresh, not a new deck.
function sameMembership(a: SessionCard[], b: SessionCard[]): boolean {
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((card) => card.id));
  return b.every((card) => ids.has(card.id));
}

// Swap each queued card for its latest copy, dropping cards no longer present.
// Repeated entries (a forgotten card queued again) stay repeated.
function refreshQueue<C extends SessionCard>(queue: C[], latest: C[]): C[] {
  const byId = new Map(latest.map((card) => [card.id, card]));
  return queue
    .map((card) => byId.get(card.id))
    .filter((card): card is C => card !== undefined);
}

export function useStudySession<C extends SessionCard, Result>({
  cards,
  loadedAt,
  buildQueue,
  sessionKey,
  onMembershipChange,
  send,
  toCard,
  paused,
  onKey,
}: {
  // The deck's cards, already projected onto its own schedule.
  cards: C[];
  // When `cards` arrived (0 = not yet). A deck kept alive by <Activity> may
  // have started hours ago; a rebuild from fresh data studies them as of then.
  loadedAt: number;
  // The deck's own rules for what to study now. `cram` = Study again: include
  // cards that aren't due yet.
  buildQueue: (cards: C[], now: number, cram: boolean) => C[];
  // The deck's session settings, as one string. A change rebuilds the queue.
  sessionKey: string;
  // When the deck's set of cards changes (a word added or removed elsewhere):
  // "rebuild" starts a fresh session; "keep" keeps the run, drops removed cards,
  // and only starts a session if the queue was empty and new cards arrived.
  onMembershipChange: "rebuild" | "keep";
  send: (command: ReviewCommand) => Promise<Result>;
  // The saved row as this deck reads it (re-projected onto its schedule).
  toCard: (result: Result) => C;
  // True while something else owns the keyboard (the edit dialog).
  paused: boolean;
  // The deck's own shortcuts, tried first. Return true if handled.
  onKey?: (e: KeyboardEvent) => boolean;
}) {
  // Session "clock": React purity forbids Date.now() during render, so the
  // current time is read when a session starts and kept in state.
  const [initial] = useState(() => {
    const at = Date.now();
    return { at, queue: buildQueue(cards, at, false) };
  });
  const [now, setNow] = useState(initial.at);
  // A working copy of the cards: saved reviews update due dates here, so Study
  // again excludes what was just pushed into the future without a reload.
  const [pool, setPool] = useState(cards);
  const [prevCards, setPrevCards] = useState(cards);
  // This session's saved reviews, by card (see withSaved).
  const [saved, setSaved] = useState<Map<string, C>>(() => new Map());
  const [prevKey, setPrevKey] = useState(sessionKey);
  const [remaining, setRemaining] = useState<C[]>(initial.queue);
  // Distinct-card accounting: a stable progress denominator and an honest
  // recap that doesn't double-count a card you forgot then recalled.
  const [sessionTotal, setSessionTotal] = useState(initial.queue.length);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [lapsedIds, setLapsedIds] = useState<Set<string>>(() => new Set());
  const [flipped, setFlipped] = useState(false);
  // The last grade, spoken ahead of the next card (cleared by a flip).
  const [lastGrade, setLastGrade] = useState<Grade | null>(null);
  // Bumped whenever a new card comes up, so a deck can reset per-card UI.
  const [turn, setTurn] = useState(0);
  // A restart / settings change waiting on "restart this session?".
  const [pendingReset, setPendingReset] = useState<(() => void) | null>(null);
  // Study again, as a request the next render serves — so a restart confirmed
  // in that dialog later still studies the latest cards and clock.
  const [restartToken, setRestartToken] = useState(0);
  const [prevRestartToken, setPrevRestartToken] = useState(0);

  const faceId = useId();
  const cardRef = useRef<HTMLButtonElement>(null);
  const answerRef = useRef<HTMLSpanElement>(null);
  const endActionRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  // Set by grade(): once the queue moves on, put focus back on the deck if the
  // control that had it (a grade button) just unmounted.
  const refocusRef = useRef(false);
  // Whether the save-error alert was up last time we looked (see its effect).
  const hadReviewErrorRef = useRef(false);
  const interactionHandledRef = useRef(false);

  function start(source: C[], at: number, cram: boolean) {
    const next = buildQueue(source, at, cram);
    setNow(at);
    setRemaining(next);
    setSessionTotal(next.length);
    setReviewedIds(new Set());
    setLapsedIds(new Set());
    setFlipped(false);
    setLastGrade(null);
    setTurn((t) => t + 1);
  }

  // New data from the parent. Same cards → swap the fresh objects into the live
  // queue (an edit keeps the queue order, progress and tallies). A changed set
  // of cards rebuilds or refreshes the run, per the deck.
  const cardsChanged = cards !== prevCards;
  const latest = cardsChanged ? withSaved(cards, saved) : pool;
  if (cardsChanged) {
    setPrevCards(cards);
    setPool(latest);
    const clock = Math.max(now, loadedAt);
    if (sameMembership(prevCards, cards)) {
      setRemaining((queue) => refreshQueue(queue, latest));
    } else if (onMembershipChange === "rebuild") {
      start(latest, clock, false);
    } else {
      const known = new Set(prevCards.map((card) => card.id));
      const arrived = cards.some((card) => !known.has(card.id));
      const kept = refreshQueue(remaining, latest);
      if (kept.length === 0 && arrived) start(latest, clock, false);
      else setRemaining(kept);
    }
  }
  // The deck's settings changed (category, level, size): a fresh session over
  // the latest schedules. Event handlers call touch() first for a fresh clock.
  if (sessionKey !== prevKey) {
    setPrevKey(sessionKey);
    start(latest, now, false);
  }
  if (restartToken !== prevRestartToken) {
    setPrevRestartToken(restartToken);
    start(latest, now, true);
  }

  function flip(next?: boolean) {
    setFlipped((f) => next ?? !f);
    setLastGrade(null);
  }

  const applySaved = useCallback(
    (result: Result) => {
      const card = toCard(result);
      const swap = (list: C[]) =>
        list.map((item) => (item.id === card.id ? card : item));
      setPool(swap);
      setRemaining(swap);
      setSaved((current) => new Map(current).set(card.id, card));
    },
    [toCard]
  );
  const outbox = useReviewOutbox<ReviewCommand, Result>({
    send,
    onSuccess: applySaved,
  });
  // A save in flight: changing the run now could race the server's answer.
  const locked = outbox.pendingCount > 0;
  const blocked = outbox.blocked;
  const reviewError = outbox.error;
  // The handlers below can run from a dialog confirmed renders later; they
  // read the save state from here, not from the render that opened it.
  const lockedRef = useRef(locked);
  useLayoutEffect(() => {
    lockedRef.current = locked;
  });
  // Grades not yet on the server are lost if the tab closes — ask first.
  useBeforeUnload(locked);

  // Most saves take ~200ms, so a "Saving…" badge on every grade just blinks.
  // Show it only once a save has been pending for a while.
  const [slowSave, setSlowSave] = useState(false);
  if (!locked && slowSave) setSlowSave(false);
  useEffect(() => {
    if (!locked) return;
    const timer = setTimeout(() => setSlowSave(true), 500);
    return () => clearTimeout(timer);
  }, [locked]);

  // A ref closes the tiny same-render window where a fast double-click could
  // enqueue the same visible card twice. The next render represents a new card
  // interaction and unlocks the ref.
  useLayoutEffect(() => {
    interactionHandledRef.current = false;
  });

  const card = remaining[0];
  const reviewedCount = reviewedIds.size;
  const done = sessionTotal - remaining.length;

  // Grade the current card. Advances optimistically (snappy), then persists in
  // the background — the server is the source of truth for the next interval.
  function grade(g: Grade) {
    const cur = remaining[0];
    if (!cur || blocked || interactionHandledRef.current) return;
    interactionHandledRef.current = true;
    // Reviewing a card before it's due (only reachable while cramming) is a
    // practice rep: the server logs it but leaves the schedule untouched, so
    // cramming can't inflate intervals.
    const accepted = outbox.enqueue({
      reviewId: createReviewId(),
      cardId: cur.id,
      grade: g,
      practice: isEarly(cur, Date.now()),
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
    setTurn((t) => t + 1);
    const rest = remaining.slice(1);
    // Lapse: bring it back later in this same session so it's drilled until it
    // sticks (a within-session learning step), on top of its server due date.
    if (g === "wrong") rest.splice(Math.min(RELEARN_GAP, rest.length), 0, cur);
    // The run is over: measure the end screen's "Next review in …" from now,
    // not from when the session started.
    if (rest.length === 0) setNow(Date.now());
    setRemaining(rest);
  }

  // Study again: re-study now, ignoring due dates (a cram pass — early grades
  // are practice reps). Runs in an event handler, so Date.now() is allowed.
  function restart() {
    if (lockedRef.current) return;
    refocusRef.current = true; // "Study again" unmounts with the end screen
    setNow(Date.now());
    setRestartToken((t) => t + 1);
  }

  // Call from a settings handler before changing the deck's settings, so the
  // rebuild their new sessionKey triggers reads a fresh clock. False = ignored
  // (a save is in flight).
  function touch(): boolean {
    if (lockedRef.current) return false;
    setNow(Date.now());
    return true;
  }

  // Grow the live run ("Add N more"), or resume after finishing it.
  function addCards(more: C[]) {
    if (lockedRef.current || more.length === 0) return;
    refocusRef.current = true; // "Study N more" unmounts with the end screen
    setLastGrade(null);
    setRemaining((r) => [...r, ...more]);
    setSessionTotal((t) => t + more.length);
  }

  // Restarting, or switching a setting, rebuilds the queue. Before the first
  // grade or after the last that's free, but mid-session it throws away the
  // run's progress (the grades themselves are already saved) — so ask.
  function guardReset(run: () => void) {
    if (reviewedCount > 0 && remaining.length > 0) setPendingReset(() => run);
    else run();
  }

  // A grade unmounts the button that was pressed (Forgot / Got it swap back to
  // "I remember", or the end screen replaces the card). Rather than letting
  // focus fall to <body>, hand it to the card — or to the end screen's action
  // once the queue is empty. A focus that survived is left alone.
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
  // card has focus. The deck's own keys (onKey) go first. Keys that belong to
  // another control (see shouldIgnoreDeckKey) are left alone.
  // Re-binds on flip / queue change so the closure over `grade` stays fresh.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (shouldIgnoreDeckKey(e, cardRef.current)) return;
      if (
        remaining.length === 0 ||
        blocked ||
        paused ||
        interactionHandledRef.current
      )
        return;
      if (onKey?.(e)) return;
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, remaining, blocked, paused, onKey]);

  const dueLeft = remaining.filter((c) => !isNew(c)).length;

  return {
    // The run
    card,
    remaining,
    pool,
    now,
    sessionTotal,
    done,
    reviewedCount,
    lapsedCount: lapsedIds.size,
    dueLeft,
    newLeft: remaining.length - dueLeft,
    flipped,
    lastGrade,
    turn,
    // Actions
    flip,
    grade,
    restart,
    touch,
    addCards,
    guardReset,
    reset: {
      open: pendingReset !== null,
      confirm: () => {
        pendingReset?.();
        setPendingReset(null);
      },
      cancel: () => setPendingReset(null),
    },
    // Saving
    locked,
    blocked,
    slowSave: slowSave && !reviewError,
    pendingCount: outbox.pendingCount,
    reviewError,
    retry: outbox.retry,
    // Wiring for the shared UI
    faceId,
    cardRef,
    answerRef,
    endActionRef,
    retryRef,
  };
}

export type StudySession<C extends SessionCard> = ReturnType<
  typeof useStudySession<C, unknown>
>;
