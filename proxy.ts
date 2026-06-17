import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 renamed the `middleware` convention to `proxy`. This runs on the
// server before pages render — here it refreshes the Supabase session and gates
// routes. Node runtime only (do not add `export const runtime`).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on everything EXCEPT API routes (they return their own 401 JSON),
  // Next internals, and static assets/fonts.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|fonts|.*\\.(?:png|jpg|jpeg|gif|svg|ico|ttf|woff2?)$).*)",
  ],
};
