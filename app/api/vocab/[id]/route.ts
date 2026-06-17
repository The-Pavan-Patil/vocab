import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import type { VocabInput } from "@/lib/types";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/vocab/[id] — update editable fields of one of the user's records.
export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  let body: Partial<VocabInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const update: Record<string, string | null> = {};
  for (const key of ["kanji", "romaji", "english", "tips", "category"] as const) {
    if (key in body) {
      const val = body[key]?.toString().trim() ?? "";
      update[key] = key === "kanji" ? val : val || null;
    }
  }
  if (update.kanji === "") {
    return NextResponse.json({ error: "Kanji cannot be empty." }, { status: 400 });
  }

  // RLS limits this to the user's own rows; another user's id matches nothing.
  const { data, error } = await auth.supabase
    .from("vocab")
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ data });
}

// DELETE /api/vocab/[id] — remove one of the user's records.
export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const { error } = await auth.supabase.from("vocab").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
