import type { ReactNode, Ref } from "react";
import { Lightbulb, Pencil, RotateCcw } from "lucide-react";
import type { Grade } from "@/lib/srs";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

// The pieces around a deck's card: its session line, settings row, save
// status, and end-of-row actions. Every deck uses the same ones, so the four
// study screens read alike.

/** What the screen reader hears after a grade, ahead of the next card. */
export const GRADE_SPOKEN: Record<Grade, string> = {
  remember: "Remembered",
  right: "Got it",
  wrong: "Forgot — it comes back later this session",
};

/** The live-region recap once the queue empties. */
export function recapAnnouncement(
  lastGrade: Grade | null,
  reviewed: number,
  revisited: number
): string {
  return `${lastGrade ? `${GRADE_SPOKEN[lastGrade]}. ` : ""}Session complete. ${reviewed - revisited} recalled${revisited > 0 ? `, ${revisited} revisited` : ""}.`;
}

/** The screen's one question — what's left, and of what kind. */
export function SessionLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p className="text-sm text-muted-foreground tabular-nums">{children}</p>
  );
}

/**
 * The deck's settings on the left; the save status and "Edit word" on the
 * right. Edit sits up here, above the card, because under it a phone's tab bar
 * hid it — fixing a word mid-session should never need a scroll.
 */
export function DeckToolbar({
  children,
  slowSave,
  pendingCount,
  edit,
}: {
  children: ReactNode;
  slowSave: boolean;
  pendingCount: number;
  // Edit the showing card's word. Left out when there's no card, or its word
  // isn't known.
  edit?: { word: string; onEdit: () => void; disabled: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      <div className="flex items-center gap-2">
        {slowSave && (
          <Badge variant="outline">
            <Spinner data-icon="inline-start" aria-hidden /> Saving{" "}
            <span className="tabular-nums">{pendingCount}</span>…
          </Badge>
        )}
        {edit && (
          <Button
            variant="outline"
            onClick={edit.onEdit}
            disabled={edit.disabled}
            aria-label={`Edit word ${edit.word}`}
          >
            <Pencil aria-hidden />
            Edit word
          </Button>
        )}
      </div>
    </div>
  );
}

/** Holds the card's footprint so the deck doesn't jump in when it arrives. */
export function DeckLoading({ label }: { label: string }) {
  return (
    <>
      <Skeleton className="study-card rounded-xl" aria-hidden />
      <span className="sr-only" role="status">
        {label}
      </span>
    </>
  );
}

/** A failed review save. Grading pauses until Retry gets it through. */
export function ReviewErrorAlert({
  error,
  onRetry,
  retryRef,
}: {
  error: string;
  onRetry: () => void;
  retryRef: Ref<HTMLButtonElement>;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Couldn’t save that review</AlertTitle>
      <AlertDescription>
        {error.replace(/\.$/, "")}. Grading is paused — check your connection,
        then retry.
      </AlertDescription>
      <AlertAction>
        <Button ref={retryRef} size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  );
}

/** "Restart this session?" — shown before a reset throws away a run's progress. */
export function RestartSessionDialog({
  open,
  reviewed,
  total,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  reviewed: number;
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title="Restart this session?"
      description={`You’re ${reviewed} of ${total} cards in. Your grades are saved — only this run’s progress starts over.`}
      confirmLabel="Restart session"
      cancelLabel="Keep studying"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

/**
 * Under the card: restart the session · (word decks) toggle the Marathi hint.
 * Editing the word lives in the DeckToolbar, above the card.
 */
export function DeckActions({
  onRestart,
  hint,
  disabled,
}: {
  onRestart: () => void;
  hint?: { pressed: boolean; onToggle: () => void };
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-center gap-2">
      <Button
        variant="ghost"
        size="icon-lg"
        onClick={onRestart}
        disabled={disabled}
        aria-label="Restart session"
      >
        <RotateCcw aria-hidden />
      </Button>
      {hint && (
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={hint.onToggle}
          disabled={disabled}
          aria-pressed={hint.pressed}
          aria-keyshortcuts="H"
          aria-label="Marathi hint"
          className="aria-pressed:bg-muted aria-pressed:text-foreground"
        >
          <Lightbulb aria-hidden />
        </Button>
      )}
    </div>
  );
}

/**
 * The Marathi hint panel. On the flipped face the tip already rides under the
 * answer, so the panel only shows there when there's none to show. The live
 * region stays mounted so the hint is read out when it appears (button or H).
 */
export function HintPanel({
  show,
  flipped,
  tips,
}: {
  show: boolean;
  flipped: boolean;
  tips: string | null | undefined;
}) {
  return (
    <div aria-live="polite">
      {show && (!flipped || !tips?.trim()) && (
        <div className="rounded-xl bg-muted px-4 py-3 text-center">
          <span className="mr-2 text-sm text-muted-foreground">Marathi</span>
          <span lang={tips ? "mr" : undefined} className="text-lg break-words">
            {tips || "No tip added."}
          </span>
        </div>
      )}
    </div>
  );
}
