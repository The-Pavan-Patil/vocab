"use client";

import { useCallback, useSyncExternalStore } from "react";

// Whether a CSS media query matches, kept live as the window resizes or a
// phone rotates. False on the server and during hydration, so only use it to
// pick a layout in UI that is built on the client anyway (the List panel is
// deferred until shown — components/Home.tsx), or the first paint can switch.
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}
