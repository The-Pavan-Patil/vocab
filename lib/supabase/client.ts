import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: SupabaseClient | null = null;

// Browser Supabase client (publishable/anon key — safe to ship; RLS scopes data).
// Memoized so the whole client tree shares one instance — avoids the
// "Multiple GoTrueClient instances detected" warning and keeps auth state in sync.
export function createClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return browserClient;
}
