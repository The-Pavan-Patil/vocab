import type { SupabaseClient } from "@supabase/supabase-js";
import type { Vocab } from "@/lib/types";
import { selectAll } from "@/lib/supabase/select-all";

// Every word of the user, newest first (id breaks ties: a batch import shares
// one created_at), read page by page so a list past the project's max rows
// (1000 by default) isn't silently cut short. The explicit user filter lets
// Postgres use vocab_user_id_idx; RLS still applies on top.
export function listWords(
  supabase: SupabaseClient,
  userId: string
): Promise<Vocab[]> {
  return selectAll<Vocab>((from, to) =>
    supabase
      .from("vocab")
      .select("*", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to)
  );
}
