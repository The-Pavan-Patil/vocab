import type { ReactNode, Ref } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The study surface every deck draws on — tap anywhere on the card to flip.
// Everything inside is a <span> (a button may only hold phrasing content); the
// deck's live region speaks the faces, and aria-describedby lets the focused
// card read its current face (the face renders with id={faceId}).
export default function StudyCard({
  cardRef,
  faceId,
  label,
  flipped,
  onFlip,
  disabled,
  className,
  children,
}: {
  cardRef: Ref<HTMLButtonElement>;
  faceId: string;
  // The card's accessible name: what a press does ("Show answer", "Show word").
  label: string;
  flipped: boolean;
  onFlip: () => void;
  disabled: boolean;
  // The deck's padding — kanji faces carry more chrome than word faces.
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      ref={cardRef}
      type="button"
      onClick={onFlip}
      disabled={disabled}
      aria-label={label}
      aria-describedby={faceId}
      aria-keyshortcuts={flipped ? "Space" : "Space Enter"}
      className="group block w-full rounded-xl outline-hidden"
    >
      {/* `study-card` (globals.css) fixes the size for every deck. */}
      <Card
        asChild
        className={cn(
          "study-card relative flex shrink-0 cursor-pointer flex-col text-center transition-[color,box-shadow,border-color] select-none group-hover:border-foreground/25 group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
          className
        )}
      >
        <span>{children}</span>
      </Card>
    </button>
  );
}
