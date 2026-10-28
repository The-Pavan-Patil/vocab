// The example sentence on the back of a study card. Sized down from the meaning
// and set apart by a rule — it's supporting context, not the thing being
// recalled. Shared by every deck so the answer face reads the same everywhere.
// Spans only: it renders inside the study-card <button>.
export default function SentenceNote({
  sentence,
}: {
  sentence: string | null | undefined;
}) {
  if (!sentence?.trim()) return null;
  return (
    <span className="block w-full border-t border-border/60 pt-2 text-left">
      <span className="mr-1.5 text-xs text-muted-foreground">
        Sentence
      </span>
      <span lang="ja" translate="no" className="jp text-sm leading-snug break-words sm:text-base">
        {sentence}
      </span>
    </span>
  );
}
