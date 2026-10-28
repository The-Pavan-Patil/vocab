"use client";

// Error and warning toasts that tell the person what to do next, not just what
// went wrong. Every failure toast in the app goes through here so the copy and
// the Retry affordance stay consistent.

import { toast } from "sonner";
import { syncKanjiCards } from "./api";

// fetch() rejects with a TypeError ("Failed to fetch", "Load failed", …) when
// the request never reached the server.
function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

function describe(err: unknown, nextStep: string): string {
  if (isNetworkError(err)) {
    return "You seem to be offline. Check your connection, then try again.";
  }
  const message = err instanceof Error ? err.message.trim() : "";
  return message ? `${message.replace(/\.$/, "")}. ${nextStep}` : nextStep;
}

/**
 * A failure toast: the server's message (or an offline hint) plus a next step,
 * and a Retry action when the caller can redo the work.
 */
export function toastError(
  title: string,
  err: unknown,
  options: { retry?: () => void; nextStep?: string } = {}
) {
  const nextStep =
    options.nextStep ??
    (options.retry ? "Try again in a moment." : "Please try again in a moment.");
  toast.error(title, {
    description: describe(err, nextStep),
    action: options.retry
      ? { label: "Retry", onClick: options.retry }
      : undefined,
  });
}

/**
 * The word saved, but its kanji cards didn't sync. Retry re-runs the deck
 * reconciliation, which picks up every word that's out of step.
 */
export function toastKanjiSyncWarning(title: string, warning: string) {
  toast.warning(title, {
    description: `${warning.replace(/\.$/, "")}. Retry to bring the Kanji decks up to date.`,
    action: {
      label: "Retry",
      onClick: () => {
        void syncKanjiCards()
          .then(() => toast.success("Kanji decks are up to date"))
          .catch((err) =>
            toastError("Kanji sync still failed", err, {
              nextStep:
                "Your words are saved. Try the sync again later.",
            })
          );
      },
    },
  });
}
