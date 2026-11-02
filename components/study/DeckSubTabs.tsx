"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// The two decks of a section (Vocab | Word Kanji, Smart Kanji | All Kanji) as a
// segmented track: the selected deck is the white segment, so it never looks
// like a hovered one.
export default function DeckSubTabs<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      spacing={1}
      className="rounded-lg bg-muted p-0.5"
      aria-label={label}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option.value} value={option.value}>
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
