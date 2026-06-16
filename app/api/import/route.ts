import { NextResponse } from "next/server";
import { parseFile } from "@/lib/parse";

export const runtime = "nodejs";

// POST /api/import — multipart form with a single "file" field.
// Parses CSV/XLSX/DOCX/PDF and returns the parsed rows WITHOUT writing to the DB.
// The client previews/edits them and then POSTs to /api/vocab to persist.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data with a 'file' field." },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const rows = await parseFile(buffer, file.name);
    return NextResponse.json({ rows, count: rows.length, filename: file.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to parse file.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
