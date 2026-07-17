import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/kanji-cards — the signed-in user's smart-deck cards (RLS-scoped).
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("kanji_cards")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
