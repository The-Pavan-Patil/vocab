import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { getKanji } from "@/lib/kanjiapi";

export const runtime = "nodejs";

type Params = { params: Promise<{ char: string }> };

// GET /api/kanji/[char] — normalized kanjiapi.dev data for one kanji, served
// from the `kanji` cache table (populated on first lookup). RLS-scoped client.
export async function GET(_request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { char } = await params;
  const character = decodeURIComponent(char);

  try {
    const info = await getKanji(auth.supabase, character);
    if (!info) {
      return NextResponse.json({ error: "Not a known kanji" }, { status: 404 });
    }
    return NextResponse.json({ data: info });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
