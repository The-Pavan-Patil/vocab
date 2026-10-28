import { cn } from "@/lib/utils";

// Past this many cards the marks would be slivers; draw one bar instead.
const MAX_MARKS = 60;

// Session progress drawn as the session itself: one mark per card, filled in
// the data hue as each is cleared — so "12 to go" reads as twelve words, not
// a percentage. The only colour on a study screen.
export default function SessionStrip({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  const fraction = total > 0 ? done / total : 0;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-label="Session progress"
      className={cn("flex h-1.5 w-full gap-0.5", className)}
    >
      {total > 0 && total <= MAX_MARKS ? (
        Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-full min-w-0 flex-1 rounded-full transition-colors duration-300 motion-reduce:transition-none",
              i < done ? "bg-data" : "bg-foreground/10"
            )}
          />
        ))
      ) : (
        <span className="h-full w-full overflow-hidden rounded-full bg-foreground/10">
          <span
            className="block h-full w-full origin-left rounded-full bg-data transition-transform duration-300 motion-reduce:transition-none"
            style={{ transform: `scaleX(${fraction})` }}
          />
        </span>
      )}
    </div>
  );
}
