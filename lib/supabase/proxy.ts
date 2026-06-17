import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Paths reachable while signed out.
const PUBLIC_PATHS = ["/login"];

function isPublic(path: string) {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

// Refreshes the Supabase session cookie on every (non-excluded) request and
// gates pages: signed-out → /login, signed-in visiting /login → /.
// The "same response object" dance below is required so refreshed Set-Cookie
// headers survive — do not return a different NextResponse than the one Supabase
// wrote cookies onto.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: nothing between createServerClient and the auth check.
  let signedIn = false;
  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims?.sub) {
    signedIn = true;
  } else if (error) {
    // Fallback for projects without JWT signing keys configured.
    const { data: u } = await supabase.auth.getUser();
    signedIn = Boolean(u.user);
  }

  const path = request.nextUrl.pathname;

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirect = NextResponse.redirect(url);
    // Carry refreshed session cookies onto the redirect.
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  };

  if (!signedIn && !isPublic(path)) return redirectTo("/login");
  if (signedIn && path === "/login") return redirectTo("/");

  return response;
}
