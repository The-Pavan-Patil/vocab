import type { MouseEvent } from "react";
import { Check, X } from "lucide-react";
import type { Grade } from "@/lib/srs";
import { Button } from "@/components/ui/button";

// The grade buttons under a card. Front: a single confident "I remember".
// Flipped: the Forgot / Got-it split — so a flip done just to confirm (Got it)
// counts as a pass, while a real lapse (Forgot) reschedules soon.
export default function GradeButtons({
  flipped,
  disabled,
  onGrade,
  reveals,
  gotItWhen,
}: {
  flipped: boolean;
  disabled: boolean;
  onGrade: (grade: Grade) => void;
  // What a flip shows: "the meaning", "the reading".
  reveals: string;
  // When "Got it" is honest: "you actually knew it", "you knew the reading".
  gotItWhen: string;
}) {
  // Each grade swaps in the next card's buttons under the pointer, so the
  // second click of a double-click would grade a card you never saw. e.detail
  // counts the clicks; keyboard presses report 0.
  const press = (grade: Grade) => (e: MouseEvent) => {
    if (e.detail > 1) return;
    onGrade(grade);
  };

  if (!flipped) {
    return (
      <div className="flex flex-col items-center gap-2">
        <Button
          size="lg"
          className="w-full max-w-xs"
          onClick={press("remember")}
          disabled={disabled}
          aria-keyshortcuts="R"
        >
          <Check data-icon="inline-start" aria-hidden /> I remember
        </Button>
        <p className="text-xs text-muted-foreground">
          Not sure? <span className="pointer-fine:hidden">Tap</span>
          <span className="hidden pointer-fine:inline">Flip</span> the card to
          reveal {reveals}
          <span className="hidden pointer-fine:inline">
            {" "}
            · <kbd>R</kbd> remembers it
          </span>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="grid w-full max-w-xs grid-cols-2 gap-2">
        <Button
          size="lg"
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={press("wrong")}
          disabled={disabled}
          aria-keyshortcuts="ArrowLeft 1"
        >
          <X data-icon="inline-start" aria-hidden /> Forgot
        </Button>
        <Button
          size="lg"
          onClick={press("right")}
          disabled={disabled}
          aria-keyshortcuts="ArrowRight 2"
        >
          <Check data-icon="inline-start" aria-hidden /> Got it
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        “Got it” if {gotItWhen} · “Forgot” to see it again soon
        <span className="hidden pointer-fine:inline">
          {" "}
          (<kbd>→</kbd> / <kbd>←</kbd>)
        </span>
      </p>
    </div>
  );
}
