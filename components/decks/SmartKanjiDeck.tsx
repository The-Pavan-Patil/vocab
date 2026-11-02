"use client";

import { useCallback, useEffect, useState } from "react";
import { Languages } from "lucide-react";
import type { KanjiCard, Vocab } from "@/lib/types";
import { NEW_CARDS_PER_SESSION, buildSession, isNew, nextDueAt } from "@/lib/srs";
import {
  ALL_LEVELS,
  JLPT_LEVELS,
  kanjiChars,
  levelLabel,
  matchesLevel,
} from "@/lib/kanji-deck";
import { reviewKanjiCard } from "@/lib/api";
import type { KanjiCardsStore } from "@/hooks/use-kanji-cards";
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
import {
  KanjiInWordBack,
  KanjiInWordFront,
  romajiReading,
  wordReadingOf,
} from "@/components/study/KanjiInWordFaces";
import { JlptLevelSelect, SessionSizeSelect } from "@/components/study/DeckSettings";
import {
  DeckActions,
  DeckToolbar,
  GRADE_SPOKEN,
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

// The Smart Kanji deck: one kanji as it appears in one of your words, filtered
// to a JLPT level (cumulative — N4 includes N5); furigana marks the word's
// kanji you don't study in any word. Its schedule is the card's base SRS columns
// (lib/decks.ts "smart-kanji"), with its own tuning.

const parseLevel = (raw: string) => {
  const level = Number(raw);
  return level === ALL_LEVELS || JLPT_LEVELS.includes(level) ? level : undefined;
};

const oldestFirst = (cards: KanjiCard[]) =>
  [...cards].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

export default function SmartKanjiDeck({
  store,
  vocab,
  onVocabChanged,
}: {
  // The section's one copy of the kanji cards (and their kanji details).
  store: KanjiCardsStore;
  // The user's words, so a card can be traced back to the row it came from and
  // edited in place. A card whose word isn't here simply gets no edit button.
  vocab: Vocab[];
  onVocabChanged?: (updated: Vocab) => void;
}) {
  const [level, setLevel] = useDeckPreference("kanji:level", 5, parseLevel);
  const [newLimit, setNewLimit] = useDeckPreference(
    "kanji:sessionSize",
    NEW_CARDS_PER_SESSION,
    parseSessionSize,
    serializeSessionSize
  );
  const [editing, setEditing] = useState<Vocab | null>(null);

  // Due reviews first (most overdue), then new cards oldest-added first.
  const buildQueue = useCallback(
    (cards: KanjiCard[], now: number, cram: boolean) =>
      buildSession(
        cards.filter((card) => matchesLevel(card, level)),
        now,
        { newLimit, cram }
      ),
    [level, newLimit]
  );
  const send = useCallback(
    (command: ReviewCommand) =>
      reviewKanjiCard(command.cardId, command.grade, {
        reviewId: command.reviewId,
        practice: command.practice,
        deck: "smart",
      }),
    []
  );
  const toCard = useCallback((row: KanjiCard) => row, []);

  const session = useStudySession({
    cards: store.cards,
    loadedAt: store.loadedAt,
    buildQueue,
    sessionKey: `${level}|${newLimit}`,
    // A refresh (an edit, a word added) keeps the run: removed cards drop out,
    // new ones wait for the next session unless the queue was already empty.
    onMembershipChange: "keep",
    send,
    toCard,
    paused: editing !== null,
  });
  const { card, flipped } = session;

  // The back lists every kanji of the word; fetch any the one load didn't have.
  const { ensureKanji } = store;
  const wordKey = card?.word ?? "";
  useEffect(() => {
    if (wordKey) ensureKanji(kanjiChars(wordKey));
  }, [wordKey, ensureKanji]);

  // Smart cards are projections of a word, so editing one edits its source row.
  const cardWord = card
    ? (vocab.find((word) => word.id === card.vocab_id) ?? null)
    : null;

  // The cards the chosen level can draw from.
  const levelPool = session.pool.filter((c) => matchesLevel(c, level));
  const queuedIds = new Set(session.remaining.map((c) => c.id));
  const waiting = oldestFirst(
    levelPool.filter((c) => isNew(c) && !queuedIds.has(c.id))
  );
  const moreBatch = Math.min(newLimit, waiting.length);
  const addMore = () => session.addCards(waiting.slice(0, newLimit));

  function changeLevel(next: number) {
    session.guardReset(() => {
      if (session.touch()) setLevel(next);
    });
  }
  function changeSize(next: number) {
    session.guardReset(() => {
      if (session.touch()) setNewLimit(next);
    });
  }

  const wordReading = card ? wordReadingOf(card) : "";
  const wordRomaji = romajiReading(wordReading);

  // One polite live region for the whole deck: the next card (after the last
  // grade), the full back face on a flip, and the recap when the queue empties.
  let announcement = "";
  if (card && !flipped) {
    announcement = [
      session.lastGrade && GRADE_SPOKEN[session.lastGrade],
      `Word: ${card.word}. Reading of ${card.character} here?`,
      `${session.remaining.length} left`,
    ]
      .filter(Boolean)
      .join(". ");
  } else if (card) {
    announcement = [
      `Reading: ${wordReading || "unknown"}${wordRomaji ? `, ${wordRomaji}` : ""}`,
      `Meaning: ${card.word_meaning || "no meaning saved"}`,
      card.word_sentence?.trim() && `Sentence: ${card.word_sentence}`,
      // The per-kanji notes can arrive later; announcing them would make the
      // live region re-read the whole back face. They're on the focused card
      // (aria-describedby) for anyone who wants them.
    ]
      .filter(Boolean)
      .join(". ");
  } else if (session.reviewedCount > 0) {
    announcement = recapAnnouncement(
      session.lastGrade,
      session.reviewedCount,
      session.lapsedCount
    );
  }

  const sessionLine = card
    ? `${session.remaining.length} left in this session · ${session.dueLeft} due, ${session.newLeft} new · ${levelLabel(level)}`
    : null;

  if (store.cards.length === 0) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Languages />
            </EmptyMedia>
            <EmptyTitle>No smart kanji yet</EmptyTitle>
            <EmptyDescription>
              Turn on “Also study as Kanji” when you add a word. Its JLPT-level
              kanji land here automatically, grouped per kanji with their
              reading in each word.
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

      <DeckToolbar
        slowSave={session.slowSave}
        pendingCount={session.pendingCount}
        edit={
          cardWord
            ? {
                word: cardWord.kanji,
                onEdit: () => setEditing(cardWord),
                disabled: session.blocked,
              }
            : undefined
        }
      >
        <JlptLevelSelect
          value={level}
          onChange={changeLevel}
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

      {levelPool.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No kanji at this level yet</EmptyTitle>
            <EmptyDescription>
              Add words with kanji of this level, or pick a broader level.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !card ? (
        <SessionEnd
          reviewed={session.reviewedCount}
          revisited={session.lapsedCount}
          caughtUpTitle={`All caught up${level !== ALL_LEVELS ? ` — ${levelLabel(level)}` : ""}`}
          availableNew={waiting.length}
          moreBatch={moreBatch}
          nextInMs={(() => {
            const next = nextDueAt(levelPool, session.now);
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
            label={flipped ? "Show word" : "Show reading"}
            flipped={flipped}
            onFlip={() => session.flip()}
            disabled={session.blocked}
            className="px-5 py-5 sm:px-6 sm:py-6"
          >
            {!flipped ? (
              <KanjiInWordFront
                id={session.faceId}
                card={card}
                studied={store.studied}
              />
            ) : (
              <KanjiInWordBack
                id={session.faceId}
                answerRef={session.answerRef}
                card={card}
                kanjiInfo={store.kanji}
                failed={store.failed}
              />
            )}
          </StudyCard>

          <GradeButtons
            flipped={flipped}
            disabled={session.blocked}
            onGrade={session.grade}
            reveals="the reading"
            gotItWhen="you knew the reading"
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
            disabled={session.blocked}
          />
        </>
      )}

      {/* Fix the source word without leaving the session. The edit re-syncs
          its kanji cards server-side; the page's word change refreshes the
          section's cards, and the session swaps them in place. */}
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
