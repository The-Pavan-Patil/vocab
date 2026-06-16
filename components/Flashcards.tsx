"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Layers, Lightbulb, Shuffle } from "lucide-react";
import { CATEGORIES, type Vocab } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function shuffled(length: number) {
  const idx = Array.from({ length }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export default function Flashcards({ vocab }: { vocab: Vocab[] }) {
  const [category, setCategory] = useState<string>("all");
  const [nonce, setNonce] = useState(0); // bump to reshuffle
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const deck = useMemo(
    () =>
      category === "all" ? vocab : vocab.filter((v) => v.category === category),
    [vocab, category]
  );

  // Derive the shuffled order; `nonce` is an intentional invalidation key so
  // that bumping it (via the Shuffle button) recomputes a fresh order.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const order = useMemo(() => shuffled(deck.length), [deck, nonce]);

  // Reset the transient view state when the order changes — done during
  // render (not in an effect) per the "you might not need an effect" pattern.
  const [prevOrder, setPrevOrder] = useState(order);
  if (prevOrder !== order) {
    setPrevOrder(order);
    setPos(0);
    setFlipped(false);
    setShowHint(false);
  }

  const reset = () => setNonce((n) => n + 1);

  const card = deck[order[pos]];

  function go(delta: number) {
    if (deck.length === 0) return;
    setFlipped(false);
    setShowHint(false);
    setPos((p) => (p + delta + deck.length) % deck.length);
  }

  // Keyboard shortcuts: ←/→ navigate, Space/Enter flip, H toggles the hint.
  // All state updates happen inside the listener callback (never synchronously
  // in the effect body) so the repo's set-state-in-effect rule stays satisfied.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.closest("input, textarea, [contenteditable=true]") ||
          t.closest("[data-slot=select-trigger]") ||
          t.closest("[role=tablist], [data-app-nav]") ||
          t.getAttribute("role") === "combobox")
      ) {
        return; // don't hijack the category select, nav, or any text field
      }
      if (deck.length === 0) return;
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          go(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          go(1);
          break;
        case " ":
        case "Enter":
          e.preventDefault();
          setFlipped((f) => !f);
          break;
        case "h":
        case "H":
          setShowHint((s) => !s);
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.length]);

  if (vocab.length === 0) {
    return (
      <Empty className="mx-auto max-w-xl">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Layers />
          </EmptyMedia>
          <EmptyTitle>No flashcards yet</EmptyTitle>
          <EmptyDescription>
            Add a few words first, then come back here to revise them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {deck.length === 0 || !card ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No cards in this category</EmptyTitle>
            <EmptyDescription>
              Pick another category or add more words.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Big study surface. Three invisible zones tile the width:
              left = previous · centre = flip · right = next. */}
          <div className="relative">
            <Card className="relative flex h-64 select-none flex-col items-center justify-center gap-3 overflow-hidden px-6 text-center sm:h-80 lg:h-96">
              {/* Centred content paints above the zones but ignores clicks. */}
              <div className="pointer-events-none relative z-10 flex flex-col items-center gap-3">
                {!flipped ? (
                  <>
                    <div className="jp text-6xl leading-tight font-medium break-words sm:text-7xl lg:text-8xl">
                      {card.kanji}
                    </div>
                    {card.romaji && (
                      <div className="text-xl text-muted-foreground sm:text-2xl">
                        {card.romaji}
                      </div>
                    )}
                    <div className="mt-2 text-xs tracking-wide text-muted-foreground/60 uppercase">
                      Tap centre to flip
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-4xl font-medium break-words sm:text-5xl">
                      {card.english || "—"}
                    </div>
                    {card.category && (
                      <Badge variant="secondary">{card.category}</Badge>
                    )}
                  </>
                )}
              </div>

              {/* LEFT zone — previous */}
              <button
                type="button"
                aria-label="Previous word"
                onClick={() => go(-1)}
                className="group/zone absolute inset-y-0 left-0 z-0 w-1/4 cursor-pointer focus-visible:outline-none"
              >
                <ChevronLeft
                  aria-hidden
                  className="absolute top-1/2 left-3 size-7 -translate-y-1/2 text-muted-foreground/25 transition-colors group-hover/zone:text-muted-foreground/70 group-focus-visible/zone:text-muted-foreground/70 motion-reduce:transition-none"
                />
              </button>

              {/* CENTRE zone — flip */}
              <button
                type="button"
                aria-label={flipped ? "Show word" : "Flip to answer"}
                onClick={() => setFlipped((f) => !f)}
                className="absolute inset-y-0 left-1/4 z-0 w-1/2 cursor-pointer focus-visible:outline-none"
              />

              {/* RIGHT zone — next */}
              <button
                type="button"
                aria-label="Next word"
                onClick={() => go(1)}
                className="group/zone absolute inset-y-0 right-0 z-0 w-1/4 cursor-pointer focus-visible:outline-none"
              >
                <ChevronRight
                  aria-hidden
                  className="absolute top-1/2 right-3 size-7 -translate-y-1/2 text-muted-foreground/25 transition-colors group-hover/zone:text-muted-foreground/70 group-focus-visible/zone:text-muted-foreground/70 motion-reduce:transition-none"
                />
              </button>
            </Card>

            <span className="sr-only" aria-live="polite">
              {flipped
                ? `Answer: ${card.english || "no English meaning"}`
                : `Word ${pos + 1} of ${deck.length}: ${card.kanji}`}
            </span>
          </div>

          {/* Progress */}
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={deck.length}
              aria-valuenow={pos + 1}
              aria-label="Flashcard progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{ width: `${((pos + 1) / deck.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              Card {pos + 1} of {deck.length}
            </span>
          </div>

          {/* Controls — fixed position. The hint is rendered BELOW so toggling
              it never shifts the Hint button. Navigating cards hides the hint. */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={reset}
              disabled={deck.length === 0}
              aria-label="Shuffle deck"
            >
              <Shuffle aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              onClick={() => setShowHint((s) => !s)}
              aria-pressed={showHint}
              aria-label={showHint ? "Hide Marathi hint" : "Show Marathi hint"}
              className={showHint ? "text-primary" : undefined}
            >
              <Lightbulb aria-hidden />
            </Button>
          </div>

          {/* Marathi hint, revealed below the controls. */}
          {showHint && (
            <div className="rounded-xl border border-accent bg-accent/40 px-4 py-3 text-center text-accent-foreground">
              <span className="mr-2 text-xs tracking-wide uppercase opacity-80">
                Marathi
              </span>
              <span className="jp text-lg">{card.tips || "No tip added."}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
