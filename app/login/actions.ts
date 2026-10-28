"use server";

import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

// Returns the failure instead of throwing it: Next.js redacts errors thrown
// from a Server Function in production, which would hide causes like rate
// limiting behind a generic message (see "Handling expected errors" in
// node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md).
export async function sendPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  const siteUrl = await getSiteUrl();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  return { error: error ? error.message : null };
}
