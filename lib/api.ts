import type { DictDetails, DictEntry, Vocab, VocabInput } from "./types";

// Thin client-side fetch helpers used by the UI components.

// Parse a JSON response, tolerating empty/non-JSON error bodies.
async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchVocab(): Promise<Vocab[]> {
  const res = await fetch("/api/vocab", { cache: "no-store" });
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? "Failed to load vocab");
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
  if (!res.ok) throw new Error((json.error as string) ?? "Failed to save");
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
  if (!res.ok) throw new Error((json.error as string) ?? "Failed to update");
  return json.data as Vocab;
}

export async function deleteVocab(id: string): Promise<void> {
  const res = await fetch(`/api/vocab/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const json = await parseJson(res);
    throw new Error((json.error as string) ?? "Failed to delete");
  }
}

export async function importFile(file: File): Promise<VocabInput[]> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/import", { method: "POST", body: form });
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? "Failed to parse file");
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
