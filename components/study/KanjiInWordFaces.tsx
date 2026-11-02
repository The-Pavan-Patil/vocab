import type { Ref } from "react";
import { toRomaji } from "wanakana";
import type { KanjiCard, KanjiInfo, KanjiPromptPart } from "@/lib/types";
import SentenceNote from "@/components/SentenceNote";
import { kanjiChars } from "@/lib/kanji-deck";
import { promptTextSize, readingTextSize } from "@/lib/card-fit";
import { cn } from "@/lib/utils";

// The faces of a kanji-in-word card (Smart Kanji, All Kanji): "what reading
// does THIS kanji take in this word?" The front carries furigana under the
// word's kanji you turned off, so only the ones you study are tested.

// `hinted` means this run carries furigana — i.e. none of its kanji are cards
// of yours, so it's free context. Those sit a shade back from the unhinted grey
// (kanji you also study, which stay recall targets), and the target character
// stays in the accent colour.
function FocusedSurface({
  surface,
  char,
  hinted = false,
}: {
  surface: string;
  char: string;
  hinted?: boolean;
}) {
  return [...surface].map((character, index) => (
    <span
      key={index}
      className={cn(
        hinted ? "text-muted-foreground/80" : "text-muted-foreground",
        // The kanji being asked about carries the screen's one hue.
        character === char && "text-data"
      )}
    >
      {character}
    </span>
  ));
}

// The card's stored prompt runs, or the whole word as one unhinted run when
// they're missing or no longer spell the word.
function promptParts(
  word: string,
  parts: KanjiPromptPart[] | null | undefined
): KanjiPromptPart[] {
  return Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every(
      (part) =>
        typeof part?.surface === "string" &&
        (part.reading === null || typeof part.reading === "string")
    ) &&
    parts.map((part) => part.surface).join("") === word
    ? parts
    : [{ surface: word, reading: null }];
}

function WordWithReadingHints({
  char,
  parts,
}: {
  char: string;
  parts: KanjiPromptPart[];
}) {
  return parts.map((part, index) => {
    const surface = (
      <FocusedSurface
        surface={part.surface}
        char={char}
        hinted={Boolean(part.reading)}
      />
    );
    // The rt is sized in em by `.furigana-under` (globals.css) so it tracks
    // whatever scale promptTextSize picked for the prompt.
    return part.reading ? (
      <ruby key={index}>
        {surface}
        <rp>(</rp>
        <rt className="font-normal text-muted-foreground">{part.reading}</rt>
        <rp>)</rp>
      </ruby>
    ) : (
      <span key={index}>{surface}</span>
    );
  });
}

export function romajiReading(reading: string | null | undefined): string {
  if (!reading?.trim()) return "";
  return toRomaji(reading).trim();
}

function compactReadings(readings: string[]): string {
  const seen = new Set<string>();
  return readings
    .map(romajiReading)
    .filter(Boolean)
    .filter((reading) => {
      if (seen.has(reading)) return false;
      seen.add(reading);
      return true;
    })
    .slice(0, 6)
    .join(", ");
}

/** The word's full reading (dotted at kanji boundaries: 行く → い.く). */
export function wordReadingOf(card: KanjiCard): string {
  return card.word_reading || card.reading || "";
}

/** Front: the word with the asked-about kanji in the accent colour. */
export function KanjiInWordFront({
  id,
  card,
}: {
  id: string;
  card: KanjiCard;
}) {
  const parts = promptParts(card.word, card.word_prompt_parts);
  // Only a word that actually carries a hint gives up type size for the ruby.
  const furigana = parts.some((part) => part.reading);
  return (
    <span
      id={id}
      className="grid h-full w-full grid-rows-[minmax(0,1fr)_auto] items-center gap-3"
    >
      <span className="flex min-h-0 items-center-safe justify-center overflow-y-auto">
        <span
          lang="ja"
          translate="no"
          className={cn(
            "jp block max-w-full font-medium break-words",
            // Furigana adds a line box under every annotated run, so the ruby
            // face gets the denser step of the same scale and room to breathe
            // between lines.
            furigana ? "furigana-under leading-[1.6]" : "leading-tight",
            promptTextSize(card.word, { dense: furigana })
          )}
        >
          <WordWithReadingHints char={card.character} parts={parts} />
        </span>
      </span>
      <span className="block text-sm text-muted-foreground">
        Reading of{" "}
        <span lang="ja" translate="no" className="jp text-data">
          {card.character}
        </span>{" "}
        here?
      </span>
    </span>
  );
}

/**
 * Back: the reading is pinned at the top; meaning + per-kanji notes scroll
 * beneath it, so a word with four kanji fills exactly the same card as a word
 * with one (↑/↓ scroll them by keyboard).
 */
export function KanjiInWordBack({
  id,
  answerRef,
  card,
  kanjiInfo,
  failed,
}: {
  id: string;
  answerRef: Ref<HTMLSpanElement>;
  card: KanjiCard;
  // Details for the word's kanji, from the deck's one fetch (plus fallbacks).
  kanjiInfo: Record<string, KanjiInfo>;
  // Kanji whose fallback lookup failed this visit.
  failed: ReadonlySet<string>;
}) {
  const wordReading = wordReadingOf(card);
  const wordRomaji = romajiReading(wordReading);
  return (
    <span id={id} className="flex h-full w-full flex-col gap-2">
      <span className="block shrink-0 space-y-0.5">
        <span
          lang="ja"
          translate="no"
          className={cn(
            "jp block leading-tight font-medium break-words",
            readingTextSize(wordReading || "—")
          )}
        >
          {wordReading || "—"}
        </span>
        {wordRomaji && (
          <span className="block text-sm leading-tight break-words text-muted-foreground sm:text-base">
            {wordRomaji}
          </span>
        )}
        <span
          lang="ja"
          translate="no"
          className="jp block text-xs break-words text-muted-foreground sm:text-sm"
        >
          {card.word}
        </span>
      </span>

      <span
        ref={answerRef}
        className="block min-h-0 w-full flex-1 space-y-2 overflow-y-auto pr-1"
      >
        <span className="block text-sm leading-snug break-words sm:text-base">
          {card.word_meaning || "—"}
        </span>
        <SentenceNote sentence={card.word_sentence} />
        <span className="grid gap-2">
          {kanjiChars(card.word).map((character) => {
            const info = kanjiInfo[character];
            const readings = info
              ? compactReadings([...info.on, ...info.kun])
              : "";
            const meanings = info?.meanings.slice(0, 4).join(", ");
            return (
              <span
                key={character}
                className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 rounded-md border border-border/70 bg-background/45 px-2 py-1.5 text-left"
              >
                <span
                  lang="ja"
                  translate="no"
                  className="jp block text-center text-xl leading-none text-data sm:text-2xl"
                >
                  {character}
                </span>
                <span className="block min-w-0 space-y-0.5">
                  <span className="block text-xs leading-tight break-words text-muted-foreground">
                    {readings ||
                      (failed.has(character)
                        ? "Details unavailable"
                        : "Reading loading…")}
                  </span>
                  <span className="block text-xs leading-snug break-words sm:text-sm">
                    {meanings ||
                      (failed.has(character)
                        ? "Couldn’t reach the kanji dictionary — it retries next time this kanji comes up."
                        : "Meaning loading…")}
                  </span>
                </span>
              </span>
            );
          })}
        </span>
      </span>
    </span>
  );
}
