import { headers } from "next/headers";
import { NextResponse } from "next/server";
import {
  createClient as createTokenClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { timingFetch } from "@/lib/server-timing";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// The signed-in user's RLS-scoped client and id, or null when not signed in.
//
// Accepts EITHER the web app's SSR cookie session OR a mobile `Authorization:
// Bearer <access_token>` header. Both yield an RLS-scoped client, so the same
// deployment serves the web frontend and the React Native app.
//
// getClaims verifies the JWT locally against the project's (cached) asymmetric
// signing keys, so the gate costs no round trip to the Auth server; for a
// legacy symmetric token it falls back to the Auth server itself. It doesn't
// notice a session revoked before its token expires — but neither does RLS,
// which trusts the same JWT on every query.
//
// getClaims returns auth errors but throws on some malformed tokens (a header
// that isn't JSON, an unsupported alg): those are "not signed in" too, a 401
// rather than a 500.
async function claimsSubject(
  client: SupabaseClient,
  token?: string
): Promise<string | null> {
  try {
    const { data } = await client.auth.getClaims(token);
    return data?.claims.sub ?? null;
  } catch {
    return null;
  }
}

async function verifiedSession(): Promise<{
  supabase: SupabaseClient;
  userId: string;
} | null> {
  // 1) Web: cookie session (refreshed first if its access token expired).
  const cookieClient = await createClient();
  const cookieUserId = await claimsSubject(cookieClient);
  if (cookieUserId) return { supabase: cookieClient, userId: cookieUserId };

  // 2) Mobile: Bearer access token. The token-scoped client carries the user's
  //    JWT on every request, so Row Level Security still applies.
  const authz = (await headers()).get("authorization") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ")
    ? authz.slice(7).trim()
    : "";
  if (token) {
    const tokenClient = createTokenClient(SUPABASE_URL, SUPABASE_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: timingFetch,
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bearerUserId = await claimsSubject(tokenClient, token);
    if (bearerUserId) return { supabase: tokenClient, userId: bearerUserId };
  }

  return null;
}

const notSignedIn = () =>
  NextResponse.json({ error: "Not signed in" }, { status: 401 });

// Declared, not inferred: inferring would add `response?: undefined` to the
// signed-in shape, and `"response" in auth` couldn't narrow it away.
type Gate<Session> = Session | { response: NextResponse };

// Gate for DB route handlers. Returns the per-request (RLS-scoped) client and the
// authenticated user, or a 401 response if not signed in. Usage:
//   const auth = await requireUser();
//   if ("response" in auth) return auth.response;
//   const { supabase, user } = auth;
export async function requireUser(): Promise<
  Gate<{ supabase: SupabaseClient; user: { id: string } }>
> {
  const session = await verifiedSession();
  if (!session) return { response: notSignedIn() };
  return { supabase: session.supabase, user: { id: session.userId } };
}

// The same gate for the review hot paths, whose RPCs read the user from
// auth.uid() and only need the subject.
export async function requireReviewSession(): Promise<
  Gate<{ supabase: SupabaseClient; subject: string }>
> {
  const session = await verifiedSession();
  if (!session) return { response: notSignedIn() };
  return { supabase: session.supabase, subject: session.userId };
}
