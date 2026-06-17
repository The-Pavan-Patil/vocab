import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Gate for DB route handlers. Returns the per-request (RLS-scoped) client and the
// authenticated user, or a 401 response if not signed in. Usage:
//   const auth = await requireUser();
//   if ("response" in auth) return auth.response;
//   const { supabase, user } = auth;
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      response: NextResponse.json({ error: "Not signed in" }, { status: 401 }),
    } as const;
  }
  return { supabase, user } as const;
}
