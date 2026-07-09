import { headers } from "next/headers";

function normalizeSiteUrl(url: string): string {
  return url.replace(/\/$/, "");
}

// Canonical public origin for auth email links. Prefer NEXT_PUBLIC_SITE_URL in
// production; otherwise derive from the incoming request (Vercel forwards host/proto).
export async function getSiteUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return normalizeSiteUrl(explicit);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return "http://localhost:3000";

  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}
