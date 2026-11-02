"use client";

import { useEffect, useRef, useState } from "react";

// One per-browser study setting (a deck's category, level, session size).
// Settings are study preferences, so they live in localStorage rather than the
// URL (which carries the tab and searches).
//
// The first render uses `fallback` — localStorage can't be read on the server
// — and the saved value is applied right after mount, a safe post-hydration
// update rather than an SSR mismatch. `parse` returns undefined for a value
// that isn't valid (anymore), which keeps the fallback.
export function useDeckPreference<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string = String
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);
  // <Activity> re-runs effects each time the deck is shown; load only once.
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return; // storage blocked (private mode) — keep the fallback
    }
    if (raw == null) return;
    const parsed = parse(raw);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (parsed !== undefined) setValue(parsed);
    // Load once per key; `parse` is a pure validator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function update(next: T) {
    setValue(next);
    try {
      window.localStorage.setItem(key, serialize(next));
    } catch {
      // Not persisted — the choice still applies for this visit.
    }
  }

  return [value, update];
}

/** A session size: a count, or Infinity stored as "all". */
export function parseSessionSize(raw: string): number | undefined {
  if (raw === "all") return Infinity;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function serializeSessionSize(size: number): string {
  return Number.isFinite(size) ? String(size) : "all";
}
