import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/supabase/require-user";
import { listWords } from "@/lib/supabase/words";
import type { Vocab } from "@/lib/types";

// The word list as the page's server render reads it. Resolves, never
// rejects: a failure is a value the client acts on (a rejected server promise
// reaches the browser with its message redacted in production).
export type InitialWords = { data: Vocab[] } | { error: string };

export async function loadInitialWords(): Promise<InitialWords> {
  try {
    const auth = await requireUser();
    if ("response" in auth) return { error: "Not signed in" };
    return { data: await listWords(auth.supabase, auth.user.id) };
  } catch (error) {
    // Next's own control-flow errors (e.g. "this render is dynamic") must
    // propagate; a real failure is logged here, since the client just quietly
    // refetches.
    unstable_rethrow(error);
    console.error("Initial word list failed:", error);
    return { error: (error as Error).message };
  }
}
