"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
import { CATEGORIES, type Grade, type Vocab } from "@/lib/types";
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
import { answerTextSize, promptTextSize } from "@/lib/card-fit";
import { cn } from "@/lib/utils";
import { reviewVocab } from "@/lib/api";
import { createReviewId } from "@/lib/review-command";
import { useReviewOutbox } from "@/hooks/use-review-outbox";
import EditVocabDialog from "@/components/EditVocabDialog";
import SentenceNote from "@/components/SentenceNote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
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

// "in 45 min" / "in 3 hours" / "in 2 days" for the caught-up screen.
function humanizeUntil(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

// `vocab` arrives already projected for `mode` (the page maps kanji rows through
// deckCard), so all the session logic below reads the right deck's schedule. The
// only mode-specific behavior here is the card faces, the localStorage key, the
// review `mode`, and re-projecting the server's response after a grade.
export default function Flashcards({
  vocab,
  mode = "word",
  onVocabChanged,
}: {
  vocab: Vocab[];
  mode?: StudyMode;
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
  // The card currently open in the edit dialog (null = closed).
  const [editing, setEditing] = useState<Vocab | null>(null);
  const interactionHandledRef = useRef(false);

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

  // A ref closes the tiny same-render window where a fast double-click could
  // enqueue the same visible card twice. The next render represents a new card
  // interaction and unlocks the ref.
  useLayoutEffect(() => {
    interactionHandledRef.current = false;
  });

  // Load the saved session size once on mount. The first render already used the
  // server default (100), so applying the stored value here is a safe
  // post-hydration update (no SSR mismatch), not derived render state.
  useEffect(() => {
    const raw =
      typeof window !== "undefined"
        ? window.localStorage.getItem(`vocab:sessionSize:${mode}`)
        : null;
    if (raw == null) return;
    const parsed = raw === "all" ? Infinity : Number(raw);
    if (parsed !== Infinity && !Number.isFinite(parsed)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    // A parent reload always restudies the fresh due data (never a cram);
    // restart() sets `cram` to re-include cards we just scheduled ahead.
    const nextQueue = buildSession(byCategory(source, category), now, {
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
  }

  const card = remaining[0];
  const reviewedCount = reviewedIds.size; // distinct cards graded this session
  const done = sessionTotal - remaining.length; // cards cleared from the queue

  // (Re)start a session against the latest schedules / a fresh clock. Runs in an
  // event handler, so reading Date.now() here is allowed.
  function restart() {
    if (sessionLocked) return;
    setNow(Date.now());
    setCram(true); // re-study now, ignoring due dates (see buildSession cram)
    setSessionId((n) => n + 1);
  }
  function changeCategory(next: string) {
    if (sessionLocked) return;
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
    setRemaining(rest);
  }

  // Keyboard: not flipped → Space/Enter flips, R = Remember. Flipped → ←/1 =
  // Forgot, →/2 = Got it, Space flips back. H toggles the Marathi hint.
  // Re-binds on flip / queue change so the closure over `grade` stays fresh.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.closest("input, textarea, [contenteditable=true]") ||
          t.closest("[data-slot=select-trigger]") ||
          t.closest("[role=tablist], [data-app-nav]") ||
          t.getAttribute("role") === "combobox")
      ) {
        return; // don't hijack the category select, nav, or any text field
      }
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
  }, [flipped, remaining, reviewBlocked, editing]);

  if (vocab.length === 0) {
    return (
      <Empty className="mx-auto max-w-xl">
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
    );
  }

  const categoryCount = byCategory(cards, category).length;

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={category}
            onValueChange={changeCategory}
            disabled={sessionLocked}
          >
            <SelectTrigger className="w-40">
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
              changeSessionSize(v === "all" ? Infinity : Number(v))
            }
            disabled={sessionLocked}
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
        />
      ) : (
        <>
          {/* Study surface — tap anywhere on the card to flip. */}
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            disabled={reviewBlocked}
            aria-label={flipped ? "Show word" : "Flip to answer"}
            className="block w-full focus-visible:outline-none"
          >
            {/* `study-card` (globals.css) fixes the size for every deck. */}
            <Card className="study-card relative flex shrink-0 cursor-pointer flex-col px-6 text-center transition-colors select-none hover:border-primary/40">
              {!flipped ? (
                // Front: prompt fills the free space, "tap to flip" pinned low.
                <div className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-2">
                  <div className="flex min-h-0 flex-col items-center justify-center gap-2 overflow-hidden">
                    <div
                      className={cn(
                        "jp w-full leading-tight font-medium break-words",
                        promptTextSize(card.kanji)
                      )}
                    >
                      {card.kanji}
                    </div>
                    {/* Word deck shows the reading up front; the Kanji deck hides
                        it — recalling the reading from the glyph is the whole task. */}
                    {!isKanji && card.romaji && (
                      <div className="w-full text-lg break-words text-muted-foreground sm:text-xl">
                        {card.romaji}
                      </div>
                    )}
                  </div>
                  <div className="text-xs tracking-wide text-muted-foreground/60 uppercase">
                    Tap to flip
                  </div>
                </div>
              ) : (
                // Back: reading (kanji deck) and the source word are pinned; the
                // answer block between them scrolls if the meaning + tip run long,
                // so the card itself never has to grow.
                <div className="flex h-full w-full flex-col gap-2">
                  {/* Kanji deck reveals the reading too (recall reading + meaning). */}
                  {isKanji && card.romaji && (
                    <div className="jp shrink-0 text-xl leading-tight font-medium break-words text-muted-foreground sm:text-2xl">
                      {card.romaji}
                    </div>
                  )}
                  <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-y-auto">
                    <div
                      className={cn(
                        "w-full leading-tight font-medium break-words",
                        answerTextSize(card.english || "—")
                      )}
                    >
                      {card.english || "—"}
                    </div>
                    {card.category && (
                      <Badge variant="secondary">{card.category}</Badge>
                    )}
                    {/* The Marathi tip rides along with the answer — reading the
                        meaning and its mnemonic together is the point of the flip. */}
                    {card.tips?.trim() && (
                      <div className="w-full rounded-lg border border-accent bg-accent/40 px-3 py-1.5 text-accent-foreground">
                        <span className="mr-1.5 text-[0.625rem] tracking-wide uppercase opacity-80">
                          Marathi
                        </span>
                        <span className="jp text-sm break-words sm:text-base">
                          {card.tips}
                        </span>
                      </div>
                    )}
                    {/* The word in context, last on the answer — you read the
                        meaning first, then see it used. */}
                    <SentenceNote sentence={card.sentence} />
                  </div>
                  <div className="jp shrink-0 truncate text-xs tracking-wide text-muted-foreground/60 uppercase">
                    {card.kanji}
                  </div>
                </div>
              )}
            </Card>
          </button>

          <span className="sr-only" aria-live="polite">
            {flipped
              ? `Answer: ${card.english || "no English meaning"}`
              : `Word: ${card.kanji}. ${remaining.length} left in this session.`}
          </span>

          {/* Grade buttons. Front: a single confident "Remember". Flipped: the
              Forgot / Got-it split — so a flip done just to confirm (Got it)
              counts as a pass, while a real lapse (Forgot) reschedules soon. */}
          {!flipped ? (
            <div className="flex flex-col items-center gap-2">
              <Button
                size="lg"
                className="w-full max-w-xs"
                onClick={() => grade("remember")}
                disabled={reviewBlocked}
              >
                <Check data-icon="inline-start" aria-hidden /> I remember
              </Button>
              <p className="text-xs text-muted-foreground">
                Not sure? Tap the card to reveal the meaning.
              </p>
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
                <Button
                  size="lg"
                  onClick={() => grade("right")}
                  disabled={reviewBlocked}
                >
                  <Check data-icon="inline-start" aria-hidden /> Got it
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                “Got it” if you actually knew it · “Forgot” to see it again soon
              </p>
            </div>
          )}

          {/* Progress: how far through the current session. */}
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
                style={{
                  width: `${sessionTotal > 0 ? (done / sessionTotal) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {remaining.length} left in this session
            </span>
            {availableNew > 0 && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={addMore}
                disabled={sessionLocked}
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
              onClick={restart}
              disabled={sessionLocked}
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
              aria-label={showHint ? "Hide Marathi hint" : "Show Marathi hint"}
              className={showHint ? "text-primary" : undefined}
            >
              <Lightbulb aria-hidden />
            </Button>
          </div>

          {/* Hint panel: on the flipped face the tip already rides under the
              answer, so only fall back to the panel when there's none to show. */}
          {showHint && (!flipped || !card.tips?.trim()) && (
            <div className="rounded-xl border border-accent bg-accent/40 px-4 py-3 text-center text-accent-foreground">
              <span className="mr-2 text-xs tracking-wide uppercase opacity-80">
                Marathi
              </span>
              <span className="jp text-lg">{card.tips || "No tip added."}</span>
            </div>
          )}
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
}: {
  reviewed: number;
  revisited: number;
  nextInMs: number | null;
  availableNew: number;
  moreBatch: number;
  onRestart: () => void;
  onStudyMore: () => void;
  busy: boolean;
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
          {finished ? "Session complete" : "All caught up"}
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
              {availableNew} new card{availableNew === 1 ? "" : "s"} still
              waiting.
            </>
          ) : nextInMs != null ? (
            <>Next review in {humanizeUntil(nextInMs)}.</>
          ) : (
            <>Add more words to keep studying.</>
          )}
        </EmptyDescription>
      </EmptyHeader>
      {availableNew > 0 ? (
        <Button onClick={onStudyMore} disabled={busy}>
          <Sparkles data-icon="inline-start" aria-hidden /> Study {moreBatch} more
        </Button>
      ) : (
        <Button variant="outline" onClick={onRestart} disabled={busy}>
          <RotateCcw data-icon="inline-start" aria-hidden /> Study again
        </Button>
      )}
    </Empty>
  );
}
