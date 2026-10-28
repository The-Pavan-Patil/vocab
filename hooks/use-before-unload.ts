"use client";

import { useEffect, useId } from "react";

// Ask before a reload / tab close throws away unsaved work. The browser shows
// its own generic prompt; the text can't be customised.
//
// Every panel lives inside <Activity>, which tears effects down while its tab
// is hidden — so a listener added and removed per component would stop
// guarding a half-typed word the moment you switched tabs. Instead each caller
// reports into one shared registry, and the effect deliberately has no
// cleanup: a hidden panel keeps its last report until it's shown again. (The
// panels never unmount, so nothing is left behind; at worst a change made while
// hidden — an import finishing — is picked up when the tab is next shown.)
// One window listener is attached only while something is dirty, so a clean
// page stays eligible for the back/forward cache.
const dirtySources = new Map<string, boolean>();
let listening = false;

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Older browsers still need returnValue set to show the prompt.
  event.returnValue = "";
}

function syncListener() {
  const anyDirty = [...dirtySources.values()].some(Boolean);
  if (anyDirty && !listening) {
    window.addEventListener("beforeunload", onBeforeUnload);
    listening = true;
  } else if (!anyDirty && listening) {
    window.removeEventListener("beforeunload", onBeforeUnload);
    listening = false;
  }
}

export function useBeforeUnload(when: boolean) {
  const id = useId();
  useEffect(() => {
    dirtySources.set(id, when);
    syncListener();
  }, [id, when]);
}
