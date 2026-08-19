// Type scales for the fixed-size study cards.
//
// Every study surface (Flashcards, SmartKanjiDeck) draws onto a card whose
// height is pinned, so the card can never grow to fit its content — the type
// has to shrink instead. Card content is user data: an "answer" can be a single
// word or a whole sentence, a prompt can be one glyph or a long compound. These
// helpers map a content length onto a responsive Tailwind text scale picked so
// the longest string in each bucket still wraps inside the card.
//
// Buckets are deliberately coarse: a card that steps down one size on a long
// meaning reads fine, while per-character measurement would need layout effects
// and would jitter on every flip.

// Japanese glyphs are full-width (~1em each), so count code points, not UTF-16
// units — a surrogate pair is one glyph on screen.
const glyphs = (text: string) => [...text.trim()].length;

/**
 * The hero face of a card — the big Japanese prompt you read first.
 * `dense` steps the whole scale down one bucket, for prompts carrying furigana
 * (ruby annotations add a second line box on top of every run).
 */
export function promptTextSize(
  text: string,
  options: { dense?: boolean } = {}
): string {
  const n = glyphs(text) + (options.dense ? 2 : 0);
  if (n <= 2) return "text-6xl sm:text-7xl lg:text-8xl";
  if (n <= 4) return "text-5xl sm:text-6xl lg:text-7xl";
  if (n <= 6) return "text-4xl sm:text-5xl lg:text-6xl";
  if (n <= 10) return "text-3xl sm:text-4xl lg:text-5xl";
  if (n <= 16) return "text-2xl sm:text-3xl lg:text-4xl";
  return "text-xl sm:text-2xl lg:text-3xl";
}

/** A revealed Japanese reading — secondary to the prompt, so a tier smaller. */
export function readingTextSize(text: string): string {
  const n = glyphs(text);
  if (n <= 4) return "text-3xl sm:text-4xl";
  if (n <= 8) return "text-2xl sm:text-3xl";
  if (n <= 14) return "text-xl sm:text-2xl";
  return "text-lg sm:text-xl";
}

/**
 * The revealed meaning — Latin text, proportional and much narrower per
 * character than a glyph, so the buckets run far longer before stepping down.
 */
export function answerTextSize(text: string): string {
  const n = text.trim().length;
  if (n <= 12) return "text-3xl sm:text-4xl";
  if (n <= 24) return "text-2xl sm:text-3xl";
  if (n <= 44) return "text-xl sm:text-2xl";
  if (n <= 80) return "text-lg sm:text-xl";
  return "text-base sm:text-lg";
}
