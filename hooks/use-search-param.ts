"use client";

import { useSyncExternalStore } from "react";

// URL query state without a <Suspense> boundary. next/navigation's
// useSearchParams() would make the whole (prerendered) app shell client-render
// behind a fallback; this reads window.location instead — null on the server
// and during hydration, the real value right after.
//
// Writes go through the native history API, which Next.js integrates with its
// router (see "window.history.pushState" in
// node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md).
// pushState doesn't fire `popstate`, so setSearchParams() announces the change
// itself.

const CHANGE = "app:searchparams";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(CHANGE, onChange);
  };
}

// Note: only setSearchParams() and Back/Forward are observed. A Next.js
// router.push / <Link> to a new query string updates the URL without either
// event; nothing in the app navigates that way today.

const noop = () => () => {};

/** False on the server and during hydration, true once the URL can be read. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false
  );
}

export function useSearchParam(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => null
  );
}

/**
 * Set (or, with null / "", remove) query params. `push` adds a history entry
 * so Back returns to the previous value — for navigation like switching tabs;
 * the default replaces the entry, for things like a search box.
 */
export function setSearchParams(
  updates: Record<string, string | null>,
  { push = false }: { push?: boolean } = {}
) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    return;
  }
  window.history[push ? "pushState" : "replaceState"](null, "", url);
  window.dispatchEvent(new Event(CHANGE));
}
