"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { fetchKanji } from "@/lib/api";
import { kanjiChars } from "@/lib/kanji-deck";
import type { KanjiInfo } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  FieldDescription,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";

// Undefined = not yet requested/loaded, present (even as null) = settled.

// A single kanji's JLPT level as a compact badge: 5=N5 … 1=N1, null = ungraded.
function jlptBadge(jlpt: number | null | undefined): string {
  return jlpt == null ? "—" : `N${jlpt}`;
}

// Per-kanji study picker shown when a word is being added "as kanji". Lists each
// kanji in `word` with its JLPT level and a switch; graded kanji default on,
// ungraded off, and the user curates from there. Reports the chosen characters
// up via `onChange` whenever the effective selection changes. Renders nothing
// when the word has no kanji. Mount it only while the option is on — unmounting
// resets the picker, which is the desired "fresh each add" behavior.
export default function KanjiBreakdown({
  word,
  onChange,
  initialSelection = null,
}: {
  word: string;
  onChange: (selection: string[]) => void;
  initialSelection?: string[] | null;
}) {
  // `info` caches the kanjiapi lookup per character (undefined = loading, null =
  // no data); `overrides` holds the user's explicit on/off choices.
  const [info, setInfo] = useState<Record<string, KanjiInfo | null>>({});
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const requested = useRef<Set<string>>(new Set());

  const chars = useMemo(() => kanjiChars(word ?? ""), [word]);
  const charsKey = chars.join("");
  const initialSelectionSet = useMemo(
    () =>
      initialSelection === null ? null : new Set(initialSelection),
    [initialSelection]
  );

  // Look up each not-yet-requested kanji's JLPT level (cached server-side).
  useEffect(() => {
    for (const ch of kanjiChars(charsKey)) {
      if (requested.current.has(ch)) continue;
      requested.current.add(ch);
      fetchKanji(ch)
        .then((kanjiInfo) =>
          setInfo((current) => ({ ...current, [ch]: kanjiInfo }))
        )
        .catch(() => setInfo((current) => ({ ...current, [ch]: null })));
    }
  }, [charsKey]);

  // Effective on-state: the user's override if any, then an explicitly saved
  // selection when editing, else the default (on for graded kanji).
  const isOn = (ch: string): boolean =>
    ch in overrides
      ? overrides[ch]
      : initialSelectionSet
        ? initialSelectionSet.has(ch)
        : info[ch]?.jlpt != null;

  // Report the effective selection up whenever it can change. onChange is read
  // through a ref (kept current in its own effect) so an inline parent callback
  // doesn't retrigger — and can't infinitely loop — this reporting effect.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    // With the default selection, wait for every JLPT lookup to settle before
    // reporting. This prevents a quick save from persisting an empty selection
    // while the graded-on defaults are still loading.
    if (
      initialSelectionSet === null &&
      chars.some((ch) => !(ch in info))
    ) {
      return;
    }
    onChangeRef.current(
      chars.filter((ch) =>
        ch in overrides
          ? overrides[ch]
          : initialSelectionSet
            ? initialSelectionSet.has(ch)
            : info[ch]?.jlpt != null
      )
    );
  }, [chars, info, initialSelectionSet, overrides]);

  if (chars.length === 0) return null;

  return (
    <FieldSet className="gap-1 rounded-lg border border-border/70 bg-muted/30 p-3">
      <FieldLegend variant="label">Kanji to study</FieldLegend>
      <FieldDescription className="mb-2">
        Each becomes its own smart card. Graded kanji are on by default — turn off
        any you already know.
      </FieldDescription>
      <ul className="flex flex-col gap-1">
        {chars.map((ch) => {
          const loaded = ch in info;
          return (
            <li key={ch} className="flex items-center gap-3 px-1 py-1">
              <span className="jp text-2xl leading-none">{ch}</span>
              {loaded ? (
                <Badge variant="secondary" className="font-normal">
                  {jlptBadge(info[ch]?.jlpt)}
                </Badge>
              ) : (
                <Loader2
                  className="size-3.5 animate-spin text-muted-foreground"
                  aria-label="Loading level"
                />
              )}
              <Switch
                className="ml-auto"
                checked={isOn(ch)}
                onCheckedChange={(v) => setOverrides((o) => ({ ...o, [ch]: v }))}
                aria-label={`Study ${ch}`}
              />
            </li>
          );
        })}
      </ul>
    </FieldSet>
  );
}
