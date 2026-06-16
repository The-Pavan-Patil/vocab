import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client using the service-role key.
// This module must never be imported into a client component — the
// service-role key bypasses RLS and must stay on the server.
//
// The client is created lazily (on first use) so that `next build`, which
// evaluates route modules without env vars, doesn't crash at import time.

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Accept any of: secret/service-role key (bypasses RLS) or the publishable/anon
  // key (works because our schema leaves RLS disabled). First defined wins.
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.local.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and a key (SUPABASE_SECRET_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)."
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

// Proxy that defers client creation until a property/method is accessed at runtime.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const c = getClient();
    const value = c[prop as keyof SupabaseClient];
    return typeof value === "function" ? value.bind(c) : value;
  },
});

export const VOCAB_TABLE = "vocab";
