import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Per-request server client bound to the request cookies, so every query runs
// as the signed-in user and Postgres RLS scopes the data automatically.
// Call inside a request (route handler / server component) — never at module top
// level. `cookies()` is async in Next 16.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `setAll` from a Server Component throws — safe to ignore; the proxy
          // (proxy.ts) refreshes the session cookie on navigations.
        }
      },
    },
  });
}
