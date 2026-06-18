import type { DictDetails, DictEntry, Grade, Vocab, VocabInput } from "./types";

// Thin client-side fetch helpers used by the UI components.

// Parse a JSON response, tolerating empty/non-JSON error bodies.
async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Throw on non-2xx; on 401 (session missing/expired) bounce to /login so the
// proxy can re-gate. Centralizes auth handling for every fetcher below.
function ensureOk(
  res: Response,
  json: Record<string, unknown>,
  fallback: string
): void {
  if (res.ok) return;
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.assign("/login");
  }
  throw new Error((json.error as string) ?? fallback);
}

export async function fetchVocab(): Promise<Vocab[]> {
  const res = await fetch("/api/vocab", { cache: "no-store" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to load vocab");
  return json.data as Vocab[];
}

export async function createVocab(
  rows: VocabInput | VocabInput[]
): Promise<number> {
  const body = Array.isArray(rows) ? { rows } : rows;
  const res = await fetch("/api/vocab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to save");
  return (json.inserted as number) ?? 1;
}

export async function updateVocab(
  id: string,
  patch: Partial<VocabInput>
): Promise<Vocab> {
  const res = await fetch(`/api/vocab/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to update");
  return json.data as Vocab;
}

export async function deleteVocab(id: string): Promise<void> {
  const res = await fetch(`/api/vocab/${id}`, { method: "DELETE" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to delete");
}

// Record a flashcard review. The server computes the next schedule and returns
// the updated card (with its new due_at / interval).
export async function reviewVocab(id: string, grade: Grade): Promise<Vocab> {
  const res = await fetch(`/api/vocab/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade }),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to save review");
  return json.data as Vocab;
}

export async function importFile(file: File): Promise<VocabInput[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/import", { method: "POST", body: form });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to parse file");
  return json.rows as VocabInput[];
}

// --- Dictionary (Takoboto-style search via Jisho/JMdict) ---

export async function searchDictionary(q: string): Promise<DictEntry[]> {
  const res = await fetch(`/api/dictionary?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
  });
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? "Search failed");
  return (json.results as DictEntry[]) ?? [];
}

export async function fetchDictionaryDetails(
  word: string
): Promise<DictDetails> {
  const res = await fetch(
    `/api/dictionary/details?word=${encodeURIComponent(word)}`,
    { cache: "no-store" }
  );
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? "Failed to load details");
  return {
    examples: (json.examples as DictDetails["examples"]) ?? [],
    kanji: (json.kanji as DictDetails["kanji"]) ?? [],
  };
}
