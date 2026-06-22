import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient as createTokenClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Gate for DB route handlers. Returns the per-request (RLS-scoped) client and the
// authenticated user, or a 401 response if not signed in. Usage:
//   const auth = await requireUser();
//   if ("response" in auth) return auth.response;
//   const { supabase, user } = auth;
//
// Accepts EITHER the web app's SSR cookie session OR a mobile `Authorization:
// Bearer <access_token>` header. Both yield an RLS-scoped client, so the same
// deployment serves the web frontend and the React Native app.
export async function requireUser() {
  // 1) Web: cookie session.
  const cookieClient = await createClient();
  const {
    data: { user: cookieUser },
  } = await cookieClient.auth.getUser();
  if (cookieUser) return { supabase: cookieClient, user: cookieUser } as const;

  // 2) Mobile: Bearer access token. The token-scoped client carries the user's
  //    JWT on every request, so Row Level Security still applies.
  const authz = (await headers()).get("authorization") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  if (token) {
    const tokenClient = createTokenClient(SUPABASE_URL, SUPABASE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const {
      data: { user: bearerUser },
    } = await tokenClient.auth.getUser(token);
    if (bearerUser) return { supabase: tokenClient, user: bearerUser } as const;
  }

  return {
    response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
  } as const;
}
