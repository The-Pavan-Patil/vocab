import type { Ref } from "react";
import { Badge } from "@/components/ui/badge";
import SentenceNote from "@/components/SentenceNote";
import { answerTextSize, promptTextSize } from "@/lib/card-fit";
import { cn } from "@/lib/utils";

// The faces of a whole-word card (Vocab, Word Kanji). The decks differ only in
// where the reading sits: Vocab shows it up front with the word; Word Kanji
// hides it — recalling the reading from the glyph is the whole task — and
// reveals it pinned at the top of the back.

/** Front: the word fills the free space, "tap to flip" pinned low. */
export function WordFront({
  id,
  word,
  reading,
}: {
  id: string;
  word: string;
  // Shown under the word — the Vocab deck's romaji. Omit to hide it.
  reading?: string | null;
}) {
  return (
    <span
      id={id}
      className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] gap-2"
    >
      <span className="flex min-h-0 flex-col items-center justify-center-safe gap-2 overflow-y-auto">
        <span
          lang="ja"
          translate="no"
          className={cn(
            "jp block w-full leading-tight font-medium break-words",
            promptTextSize(word)
          )}
        >
          {word}
        </span>
        {reading && (
          <span className="block w-full text-lg break-words text-muted-foreground sm:text-xl">
            {reading}
          </span>
        )}
      </span>
      <span className="block text-sm text-muted-foreground">
        <span className="pointer-fine:hidden">Tap to flip</span>
        <span className="hidden pointer-fine:inline">
          Click or press Space to flip
        </span>
      </span>
    </span>
  );
}

/**
 * Back: the reading (Word Kanji) and the source word are pinned; the answer
 * block between them scrolls if the meaning + tip run long, so the card itself
 * never has to grow (↑/↓ scroll it by keyboard).
 */
export function WordBack({
  id,
  answerRef,
  word,
  reading,
  english,
  category,
  tips,
  sentence,
}: {
  id: string;
  answerRef: Ref<HTMLSpanElement>;
  word: string;
  // Revealed at the top — the Word Kanji deck's reading. Omit for Vocab.
  reading?: string | null;
  english: string | null;
  category: string | null;
  tips: string | null;
  sentence: string | null;
}) {
  return (
    <span id={id} className="flex h-full w-full flex-col gap-2">
      {reading && (
        <span
          lang="ja"
          translate="no"
          className="jp block shrink-0 text-xl leading-tight font-medium break-words text-muted-foreground sm:text-2xl"
        >
          {reading}
        </span>
      )}
      <span
        ref={answerRef}
        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center-safe gap-2 overflow-y-auto"
      >
        <span
          className={cn(
            "block w-full leading-tight font-medium break-words",
            answerTextSize(english || "—")
          )}
        >
          {english || "—"}
        </span>
        {category && <Badge variant="secondary">{category}</Badge>}
        {/* The Marathi tip rides along with the answer — reading the meaning
            and its mnemonic together is the point of the flip. */}
        {tips?.trim() && (
          <span className="block w-full rounded-lg bg-muted px-3 py-1.5">
            <span className="mr-1.5 text-xs text-muted-foreground">
              Marathi
            </span>
            <span lang="mr" className="text-sm break-words sm:text-base">
              {tips}
            </span>
          </span>
        )}
        {/* The word in context, last on the answer — you read the meaning
            first, then see it used. */}
        <SentenceNote sentence={sentence} />
      </span>
      <span
        lang="ja"
        translate="no"
        className="jp block shrink-0 truncate text-sm text-muted-foreground"
      >
        {word}
      </span>
    </span>
  );
}
