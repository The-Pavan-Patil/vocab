"use client";

import { useCallback, useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { CATEGORIES, type Vocab, type VocabLoadState } from "@/lib/types";
import { NEW_CARDS_PER_SESSION, buildSession, isNew, nextDueAt } from "@/lib/srs";
import { reviewVocab } from "@/lib/api";
import { projectCard } from "@/lib/decks";
import { useStudySession, type ReviewCommand } from "@/hooks/use-study-session";
import {
  parseSessionSize,
  serializeSessionSize,
  useDeckPreference,
} from "@/hooks/use-deck-preference";
import EditVocabDialog from "@/components/EditVocabDialog";
import StudyCard from "@/components/study/StudyCard";
import GradeButtons from "@/components/study/GradeButtons";
import SessionProgress from "@/components/study/SessionProgress";
import SessionEnd from "@/components/study/SessionEnd";
import { WordBack, WordFront } from "@/components/study/WordFaces";
import { CategorySelect, SessionSizeSelect } from "@/components/study/DeckSettings";
import {
  DeckActions,
  DeckLoading,
  DeckToolbar,
  GRADE_SPOKEN,
  HintPanel,
  RestartSessionDialog,
  ReviewErrorAlert,
  SessionLine,
  recapAnnouncement,
} from "@/components/study/DeckChrome";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// The Word Kanji deck: words with "Also study as Kanji" on, shown as the bare
// glyphs — recall the reading and the meaning. Its schedule is the word row's
// independent kanji_* columns (lib/decks.ts "word-kanji"), with its own tuning.

const byCategory = (list: Vocab[], category: string) =>
  category === "all" ? list : list.filter((v) => v.category === category);

const parseCategory = (raw: string) =>
  raw === "all" || CATEGORIES.includes(raw as never) ? raw : undefined;

const oldestFirst = (cards: Vocab[]) =>
  [...cards].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

export default function WordKanjiDeck({
  vocab,
  loadState,
  loadedAt,
  onVocabChanged,
}: {
  // The full word list; this deck studies the opted-in ones.
  vocab: Vocab[];
  // The page's fetch of `vocab`: an empty list only means "no words" once
  // it's "ready". `loadedAt` is when that list arrived (0 = not yet).
  loadState: VocabLoadState;
  loadedAt: number;
  // Told about a word edited from inside a session, so the rest of the app can
  // catch up without this deck reloading (and restarting the session).
  onVocabChanged?: (updated: Vocab) => void;
}) {
  const [category, setCategory] = useDeckPreference(
    "vocab:category:kanji",
    "all",
    parseCategory
  );
  // How many never-seen cards to introduce per session (20 / 50 / 100 / All).
  const [newLimit, setNewLimit] = useDeckPreference(
    "vocab:sessionSize:kanji",
    NEW_CARDS_PER_SESSION,
    parseSessionSize,
    serializeSessionSize
  );
  const [editing, setEditing] = useState<Vocab | null>(null);
  const [showHint, setShowHint] = useState(false);

  // The opted-in words, projected so every session helper reads the kanji_*
  // schedule while the faces keep the word's own fields.
  const cards = useMemo(
    () =>
      vocab
        .filter((v) => v.study_as_kanji)
        .map((v) => projectCard(v, "word-kanji")),
    [vocab]
  );

  // Due reviews first (most overdue), then new words oldest-added first.
  const buildQueue = useCallback(
    (cards: Vocab[], now: number, cram: boolean) =>
      buildSession(byCategory(cards, category), now, { newLimit, cram }),
    [category, newLimit]
  );
  const send = useCallback(
    (command: ReviewCommand) =>
      reviewVocab(command.cardId, command.grade, {
        reviewId: command.reviewId,
        practice: command.practice,
        mode: "kanji",
      }),
    []
  );
  // The server returns the raw row — re-project it onto the kanji schedule.
  const toCard = useCallback(
    (row: Vocab) => projectCard(row, "word-kanji"),
    []
  );
  // H toggles the Marathi hint.
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key !== "h" && e.key !== "H") return false;
    setShowHint((s) => !s);
    return true;
  }, []);

  const session = useStudySession({
    cards,
    loadedAt,
    buildQueue,
    sessionKey: `${category}|${newLimit}`,
    // A word added or deleted elsewhere is a different deck — start over.
    onMembershipChange: "rebuild",
    send,
    toCard,
    paused: editing !== null,
    onKey,
  });
  const { card, flipped } = session;

  // The hint is per card: a new card comes up with it closed.
  const [hintTurn, setHintTurn] = useState(session.turn);
  if (hintTurn !== session.turn) {
    setHintTurn(session.turn);
    setShowHint(false);
  }

  const inCategory = byCategory(session.pool, category);
  // New words in this category not already queued — the pool "Add more" draws
  // from, oldest-added first (matching buildSession, so old words aren't starved).
  const queuedIds = new Set(session.remaining.map((c) => c.id));
  const waiting = oldestFirst(
    inCategory.filter((c) => isNew(c) && !queuedIds.has(c.id))
  );
  const moreBatch = Math.min(newLimit, waiting.length);
  const addMore = () => session.addCards(waiting.slice(0, newLimit));

  function changeCategory(next: string) {
    session.guardReset(() => {
      if (session.touch()) setCategory(next);
    });
  }
  function changeSize(next: number) {
    session.guardReset(() => {
      if (session.touch()) setNewLimit(next);
    });
  }

  // One polite live region for the whole deck: the next card (after the last
  // grade), the full answer on a flip, and the recap when the queue empties.
  let announcement = "";
  if (inCategory.length > 0 && card && !flipped) {
    announcement = [
      session.lastGrade && GRADE_SPOKEN[session.lastGrade],
      `Word: ${card.kanji}`,
      `${session.remaining.length} left in this session`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (inCategory.length > 0 && card) {
    announcement = [
      card.romaji && `Reading: ${card.romaji}`,
      `Meaning: ${card.english || "no English meaning"}`,
      card.category && `Category: ${card.category}`,
      card.tips?.trim() && `Marathi: ${card.tips}`,
      card.sentence?.trim() && `Sentence: ${card.sentence}`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (inCategory.length > 0 && session.reviewedCount > 0) {
    announcement = recapAnnouncement(
      session.lastGrade,
      session.reviewedCount,
      session.lapsedCount
    );
  }

  const sessionLine = card
    ? `${session.remaining.length} left in this session · ${session.dueLeft} due, ${session.newLeft} new`
    : null;

  if (cards.length === 0 && loadState === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <DeckLoading label="Loading cards…" />
      </div>
    );
  }
  // The page's own alert explains a failed load (with a Retry); an empty state
  // here would wrongly say there's nothing to study.
  if (cards.length === 0 && loadState === "failed") return null;
  if (cards.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Layers />
            </EmptyMedia>
            <EmptyTitle>No kanji yet</EmptyTitle>
            <EmptyDescription>
              Turn on “Also study as Kanji” on a word (Add, Dictionary, or the
              List tab) to drill it here as a kanji-only card.
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

      <SessionLine>{sessionLine}</SessionLine>

      <DeckToolbar slowSave={session.slowSave} pendingCount={session.pendingCount}>
        <CategorySelect
          value={category}
          onChange={changeCategory}
          disabled={session.blocked}
        />
        <SessionSizeSelect
          value={newLimit}
          onChange={changeSize}
          disabled={session.blocked}
        />
      </DeckToolbar>

      {session.reviewError && (
        <ReviewErrorAlert
          error={session.reviewError}
          onRetry={session.retry}
          retryRef={session.retryRef}
        />
      )}

      {inCategory.length === 0 ? (
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
        <SessionEnd
          reviewed={session.reviewedCount}
          revisited={session.lapsedCount}
          availableNew={waiting.length}
          moreBatch={moreBatch}
          nextInMs={(() => {
            const next = nextDueAt(inCategory, session.now);
            return next == null ? null : next - session.now;
          })()}
          onStudyMore={addMore}
          onRestart={session.restart}
          busy={session.locked}
          actionRef={session.endActionRef}
        />
      ) : (
        <>
          <StudyCard
            cardRef={session.cardRef}
            faceId={session.faceId}
            label={flipped ? "Show word" : "Show answer"}
            flipped={flipped}
            onFlip={() => session.flip()}
            disabled={session.blocked}
            className="px-6"
          >
            {!flipped ? (
              // The reading stays hidden — recalling it from the glyph is the
              // whole task.
              <WordFront id={session.faceId} word={card.kanji} />
            ) : (
              <WordBack
                id={session.faceId}
                answerRef={session.answerRef}
                word={card.kanji}
                reading={card.romaji}
                english={card.english}
                category={card.category}
                tips={card.tips}
                sentence={card.sentence}
              />
            )}
          </StudyCard>

          <GradeButtons
            flipped={flipped}
            disabled={session.blocked}
            onGrade={session.grade}
            reveals="the reading and meaning"
            gotItWhen="you actually knew it"
          />

          <SessionProgress
            done={session.done}
            total={session.sessionTotal}
            availableNew={waiting.length}
            moreBatch={moreBatch}
            onAddMore={addMore}
            disabled={session.blocked}
          />

          <DeckActions
            onRestart={() => session.guardReset(session.restart)}
            onEdit={() => setEditing(card)}
            editLabel={`Edit ${card.kanji}`}
            hint={{ pressed: showHint, onToggle: () => setShowHint((s) => !s) }}
            disabled={session.blocked}
          />

          <HintPanel show={showHint} flipped={flipped} tips={card.tips} />
        </>
      )}

      {/* Fix a word without leaving the session: the page patches its list,
          and the session swaps the saved row into the live queue in place. */}
      <EditVocabDialog
        word={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => onVocabChanged?.(updated)}
      />

      <RestartSessionDialog
        open={session.reset.open}
        reviewed={session.reviewedCount}
        total={session.sessionTotal}
        onConfirm={session.reset.confirm}
        onCancel={session.reset.cancel}
      />
    </div>
  );
}
