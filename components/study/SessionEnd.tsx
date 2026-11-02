import type { Ref } from "react";
import { Clock, RotateCcw, Sparkles } from "lucide-react";
import { formatUntil } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// Shown when the session queue empties — either a finished run (with a recap)
// or "nothing due yet" with the time until the next review. While new cards
// are still waiting, the way on is to study more of them; otherwise, to go
// again over what's been studied.
export default function SessionEnd({
  reviewed,
  revisited,
  caughtUpTitle = "All caught up",
  availableNew,
  moreBatch,
  nextInMs,
  onStudyMore,
  onRestart,
  busy,
  actionRef,
}: {
  reviewed: number;
  revisited: number;
  caughtUpTitle?: string;
  availableNew: number;
  moreBatch: number;
  nextInMs: number | null;
  onStudyMore: () => void;
  onRestart: () => void;
  busy: boolean;
  // Focus lands here when the last card is graded (see useStudySession).
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
          <h2>{finished ? "Session complete" : caughtUpTitle}</h2>
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
