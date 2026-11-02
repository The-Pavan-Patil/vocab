import SessionStrip from "@/components/SessionStrip";
import { Button } from "@/components/ui/button";

// How far through the current session, and — while new cards are still
// waiting — a way to grow it.
export default function SessionProgress({
  done,
  total,
  availableNew,
  moreBatch,
  onAddMore,
  disabled,
}: {
  done: number;
  total: number;
  availableNew: number;
  // Size of the next "Add more" batch.
  moreBatch: number;
  onAddMore: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <SessionStrip done={done} total={total} />
      <span className="text-xs text-muted-foreground tabular-nums">
        {done} of {total} done
      </span>
      {availableNew > 0 && (
        <Button
          variant="link"
          size="sm"
          className="h-auto min-h-6 px-1.5 py-1 text-xs"
          onClick={onAddMore}
          disabled={disabled}
        >
          Add {moreBatch} more · {availableNew} new waiting
        </Button>
      )}
    </div>
  );
}
