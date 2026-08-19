// Tests for the fixed-card type scales (lib/card-fit.ts). Run with:
//   node --test lib/card-fit.test.ts
//
// The contract these pin down: longer content never gets a bigger type scale
// (that's what keeps content inside a card that can't grow), the scales stay
// responsive (every class list carries an `sm:` step), and glyph counting is by
// code point so a surrogate pair isn't charged twice.

import { test } from "node:test";
import assert from "node:assert/strict";
import { answerTextSize, promptTextSize, readingTextSize } from "./card-fit.ts";

// "text-3xl" -> 3, "text-lg" -> 0.5-ish; only the ordering matters here.
const RANK = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
  "text-7xl",
  "text-8xl",
];

// The base (unprefixed) size in a class list, as a rank index.
function baseRank(classes: string): number {
  const base = classes.split(" ").find((c) => !c.includes(":"));
  assert.ok(base, `no unprefixed size in "${classes}"`);
  const rank = RANK.indexOf(base);
  assert.notEqual(rank, -1, `unknown size "${base}"`);
  return rank;
}

const ASCENDING = [
  "a",
  "ab",
  "abcd",
  "abcdef",
  "abcdefghij",
  "abcdefghijklmnop",
  "a".repeat(40),
  "a".repeat(90),
  "a".repeat(400),
];

for (const [name, size] of [
  ["promptTextSize", promptTextSize],
  ["readingTextSize", readingTextSize],
  ["answerTextSize", answerTextSize],
] as const) {
  test(`${name} never grows as content grows`, () => {
    let previous = Infinity;
    for (const text of ASCENDING) {
      const rank = baseRank(size(text));
      assert.ok(
        rank <= previous,
        `${name}("${text.slice(0, 8)}…" len ${text.length}) went up: ${size(text)}`
      );
      previous = rank;
    }
  });

  test(`${name} stays responsive and ignores surrounding whitespace`, () => {
    assert.ok(size("word").includes("sm:text-"));
    assert.equal(size("  word  "), size("word"));
  });
}

test("promptTextSize counts glyphs, not UTF-16 units", () => {
  // 𠮟 is outside the BMP: one glyph, two code units.
  assert.equal(promptTextSize("𠮟"), promptTextSize("字"));
});

test("promptTextSize dense mode is never larger than plain", () => {
  for (const text of ["字", "漢字", "一生懸命", "食べに行きました"]) {
    assert.ok(
      baseRank(promptTextSize(text, { dense: true })) <=
        baseRank(promptTextSize(text)),
      `dense grew for "${text}"`
    );
  }
});

test("a single glyph gets the largest scale, a sentence the smallest", () => {
  assert.equal(promptTextSize("字"), "text-6xl sm:text-7xl lg:text-8xl");
  assert.equal(
    answerTextSize("to go out for a walk in the evening after dinner with friends"),
    "text-lg sm:text-xl"
  );
});
