import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing route for Supabase email links (e.g. password recovery). Supabase
// sends the user here after they click the link; we turn the one-time code (PKCE
// `?code=` from the default template) or `?token_hash=` + `?type=` (verifyOtp,
// used by custom templates) into a session cookie, then forward them to `next`
// (e.g. /reset-password). Must be reachable while signed out — see proxy.ts.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = searchParams.get("next") || "/";
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();

  let failed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    failed = Boolean(error);
  } else {
    failed = true;
  }

  const dest = request.nextUrl.clone();
  dest.search = "";
  if (failed) {
    // Bounce back to sign-in with a flag the page turns into a toast.
    dest.pathname = "/login";
    dest.searchParams.set("error", "auth_link");
  } else {
    dest.pathname = next;
  }
  return NextResponse.redirect(dest);
}
