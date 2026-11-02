import { CATEGORIES } from "@/lib/types";
import { SESSION_SIZE_OPTIONS } from "@/lib/srs";
import { ALL_LEVELS, JLPT_LEVELS, levelLabel } from "@/lib/kanji-deck";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// A deck's settings selects. Each is disabled only while grading is paused (a
// failed save) — not while a save is in flight, which is ~200ms after every
// grade and would make the dimming flicker. The decks' change handlers ignore
// that window themselves (useStudySession's touch()).

export function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-40" aria-label="Category">
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
  );
}

export function SessionSizeSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={Number.isFinite(value) ? String(value) : "all"}
      onValueChange={(v) => onChange(v === "all" ? Infinity : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className="w-36" aria-label="New cards per session">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {SESSION_SIZE_OPTIONS.map((n) => (
            <SelectItem
              key={String(n)}
              value={Number.isFinite(n) ? String(n) : "all"}
            >
              {Number.isFinite(n) ? `${n} / session` : "All new cards"}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

export function JlptLevelSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className="w-32" aria-label="JLPT level">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {JLPT_LEVELS.map((l) => (
            <SelectItem key={l} value={String(l)}>
              JLPT {levelLabel(l)}
            </SelectItem>
          ))}
          <SelectItem value={String(ALL_LEVELS)}>All levels</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
