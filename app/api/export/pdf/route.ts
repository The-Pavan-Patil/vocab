import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import { buildPdf } from "@/lib/export-pdf";
import { listWords } from "@/lib/supabase/words";
import { withServerTiming } from "@/lib/server-timing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/export/pdf — download the signed-in user's vocab list as a PDF.
export const GET = withServerTiming(async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let words;
  try {
    words = await listWords(auth.supabase, auth.user.id);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const buffer = await buildPdf(words);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="japanese-vocab.pdf"',
    },
  });
});
