"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Layers,
  Lightbulb,
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
import { reviewVocab } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
}: {
  vocab: Vocab[];
  mode?: StudyMode;
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
  const [error, setError] = useState<string | null>(null);

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

  // (Re)build the session whenever the source list, category, session id, or
  // chosen size changes. New identity on any dep change → triggers the
  // render-time reset below (the repo's "you might not need an effect" pattern).
  const sessionToken = useMemo(
    () => ({}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vocab, category, sessionId, newLimit]
  );
  const [prevToken, setPrevToken] = useState(sessionToken);
  if (prevToken !== sessionToken) {
    setPrevToken(sessionToken);
    const vocabChanged = prevVocab !== vocab;
    // When the parent reloads its list, resync our working copy and study the
    // fresh data; otherwise keep our locally-updated schedules.
    const source = vocabChanged ? vocab : cards;
    if (vocabChanged) {
      setPrevVocab(vocab);
      setCards(vocab);
    }
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
    setError(null);
  }

  const card = remaining[0];
  const reviewedCount = reviewedIds.size; // distinct cards graded this session
  const done = sessionTotal - remaining.length; // cards cleared from the queue

  // (Re)start a session against the latest schedules / a fresh clock. Runs in an
  // event handler, so reading Date.now() here is allowed.
  function restart() {
    setNow(Date.now());
    setCram(true); // re-study now, ignoring due dates (see buildSession cram)
    setSessionId((n) => n + 1);
  }
  function changeCategory(next: string) {
    setNow(Date.now());
    setCategory(next);
  }
  // Change the per-session new-card cap and remember it for next time. The
  // sessionToken dep on `newLimit` rebuilds the queue.
  function changeSessionSize(next: number) {
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
  async function grade(g: Grade) {
    const cur = remaining[0];
    if (!cur) return;
    // Reviewing a card before it's due (only reachable while cramming) is a
    // practice rep: the server logs it but leaves the schedule untouched, so
    // cramming can't inflate intervals.
    const practice = isEarly(cur, now);
    setReviewedIds((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
    if (g === "wrong") {
      setLapsedIds((s) => (s.has(cur.id) ? s : new Set(s).add(cur.id)));
    }
    setFlipped(false);
    setShowHint(false);
    setError(null);
    setRemaining((r) => {
      const rest = r.slice(1);
      if (g === "wrong") {
        // Lapse: bring it back later in this same session so it's drilled until
        // it sticks (within-session "learning step"), in addition to its
        // server-side due date.
        const at = Math.min(RELEARN_GAP, rest.length);
        rest.splice(at, 0, cur);
      }
      return rest;
    });
    try {
      const updated = await reviewVocab(cur.id, g, { practice, mode });
      // Re-project the raw server row for this deck so our working copy keeps
      // reading the right schedule (no-op for the word deck).
      const projected = deckCard(updated, mode);
      setCards((cs) => cs.map((c) => (c.id === projected.id ? projected : c)));
    } catch (e) {
      setError((e as Error).message);
    }
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
      if (remaining.length === 0) return;
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
  }, [flipped, remaining]);

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={changeCategory}>
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
        {reviewedCount > 0 && (
          <span className="text-sm text-muted-foreground">
            {reviewedCount} reviewed
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Couldn’t save that review: {error}
        </div>
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
        />
      ) : (
        <>
          {/* Study surface — tap anywhere on the card to flip. */}
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? "Show word" : "Flip to answer"}
            className="block w-full focus-visible:outline-none"
          >
            <Card className="relative flex h-64 cursor-pointer select-none flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center transition-colors hover:border-primary/40 sm:h-80 lg:h-96">
              {!flipped ? (
                <>
                  <div className="jp text-6xl leading-tight font-medium break-words sm:text-7xl lg:text-8xl">
                    {card.kanji}
                  </div>
                  {/* Word deck shows the reading up front; the Kanji deck hides
                      it — recalling the reading from the glyph is the whole task. */}
                  {!isKanji && card.romaji && (
                    <div className="text-xl text-muted-foreground sm:text-2xl">
                      {card.romaji}
                    </div>
                  )}
                  <div className="mt-2 text-xs tracking-wide text-muted-foreground/60 uppercase">
                    Tap to flip
                  </div>
                </>
              ) : (
                <>
                  {/* Kanji deck reveals the reading too (recall reading + meaning). */}
                  {isKanji && card.romaji && (
                    <div className="jp text-2xl font-medium text-muted-foreground sm:text-3xl">
                      {card.romaji}
                    </div>
                  )}
                  <div className="text-4xl font-medium break-words sm:text-5xl">
                    {card.english || "—"}
                  </div>
                  {card.category && (
                    <Badge variant="secondary">{card.category}</Badge>
                  )}
                  <div className="mt-2 text-xs tracking-wide text-muted-foreground/60 uppercase">
                    {card.kanji}
                  </div>
                </>
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
                className="w-full max-w-xs gap-2"
                onClick={() => grade("remember")}
              >
                <Check aria-hidden /> I remember
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
                  className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => grade("wrong")}
                >
                  <X aria-hidden /> Forgot
                </Button>
                <Button size="lg" className="gap-2" onClick={() => grade("right")}>
                  <Check aria-hidden /> Got it
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
              aria-label="Restart session"
            >
              <RotateCcw aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setShowHint((s) => !s)}
              aria-pressed={showHint}
              aria-label={showHint ? "Hide Marathi hint" : "Show Marathi hint"}
              className={showHint ? "text-primary" : undefined}
            >
              <Lightbulb aria-hidden />
            </Button>
          </div>

          {showHint && (
            <div className="rounded-xl border border-accent bg-accent/40 px-4 py-3 text-center text-accent-foreground">
              <span className="mr-2 text-xs tracking-wide uppercase opacity-80">
                Marathi
              </span>
              <span className="jp text-lg">{card.tips || "No tip added."}</span>
            </div>
          )}
        </>
      )}
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
}: {
  reviewed: number;
  revisited: number;
  nextInMs: number | null;
  availableNew: number;
  moreBatch: number;
  onRestart: () => void;
  onStudyMore: () => void;
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
        <Button className="gap-2" onClick={onStudyMore}>
          <Sparkles aria-hidden /> Study {moreBatch} more
        </Button>
      ) : (
        <Button variant="outline" className="gap-2" onClick={onRestart}>
          <RotateCcw aria-hidden /> Study again
        </Button>
      )}
    </Empty>
  );
}
