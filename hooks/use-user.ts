"use client";

import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// The signed-in user, for display (the account menu's address). One auth
// subscription is shared by every caller — the menu renders twice, sidebar and
// top bar — and its first event (INITIAL_SESSION) carries the session already
// in the browser, so showing the address costs no request. Access is gated
// elsewhere (the proxy, and every API route verifies the JWT), so the stored
// session is good enough to show who's signed in.

type AuthSnapshot = { user: User | null; loading: boolean };

const LOADING: AuthSnapshot = { user: null, loading: true };
let snapshot = LOADING;
const listeners = new Set<() => void>();
let subscription: { unsubscribe: () => void } | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!subscription) {
    subscription = createClient().auth.onAuthStateChange((_event, session) => {
      snapshot = { user: session?.user ?? null, loading: false };
      for (const notify of listeners) notify();
    }).data.subscription;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      subscription?.unsubscribe();
      subscription = null;
    }
  };
}

export function useUser(): AuthSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => LOADING);
}
