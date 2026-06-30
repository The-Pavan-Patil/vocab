import { createRequire } from "node:module";
import path from "node:path";

// Server-only. Converts arbitrary Japanese (mixed kanji/kana) to full,
// space-separated Hepburn romaji using kuroshiro + the kuromoji analyzer.
// Jisho's example-sentence readings are incomplete (common kanji are left
// unconverted), so a real tokenizer is required for learner-friendly romaji.

const require = createRequire(import.meta.url);

export type Converter = {
  convert: (text: string, opts: Record<string, unknown>) => Promise<string>;
};

let converter: Converter | null = null;
let initPromise: Promise<Converter> | null = null;

// Exported so lib/furigana.ts shares this one heavy kuromoji init (it's the same
// analyzer, just used in furigana mode rather than spaced-romaji mode).
export async function getConverter(): Promise<Converter> {
  if (converter) return converter;
  if (!initPromise) {
    initPromise = (async () => {
      const Kuroshiro =
        require("kuroshiro").default || require("kuroshiro");
      const KuromojiAnalyzer =
        require("kuroshiro-analyzer-kuromoji").default ||
        require("kuroshiro-analyzer-kuromoji");
      const k = new Kuroshiro();
      await k.init(
        new KuromojiAnalyzer({
          dictPath: path.join(process.cwd(), "node_modules/kuromoji/dict"),
        })
      );
      return k as Converter;
    })();
  }
  try {
    converter = await initPromise;
    return converter;
  } catch (e) {
    initPromise = null; // allow a later retry if init failed transiently
    throw e;
  }
}

export async function toSentenceRomaji(text: string): Promise<string> {
  if (!text.trim()) return "";
  try {
    const k = await getConverter();
    return await k.convert(text, {
      to: "romaji",
      mode: "spaced",
      romajiSystem: "hepburn",
    });
  } catch {
    return ""; // degrade gracefully — examples still show kanji + English
  }
}
