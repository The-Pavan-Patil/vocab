// The example sentence on the back of a study card. Sized down from the meaning
// and set apart by a rule — it's supporting context, not the thing being
// recalled. Shared by every deck so the answer face reads the same everywhere.
export default function SentenceNote({
  sentence,
}: {
  sentence: string | null | undefined;
}) {
  if (!sentence?.trim()) return null;
  return (
    <div className="w-full border-t border-border/60 pt-2 text-left">
      <span className="mr-1.5 text-[0.625rem] tracking-wide text-muted-foreground/70 uppercase">
        Sentence
      </span>
      <span className="jp text-sm leading-snug break-words sm:text-base">
        {sentence}
      </span>
    </div>
  );
}
