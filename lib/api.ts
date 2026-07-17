import type {
  DictDetails,
  DictEntry,
  Grade,
  KanjiCard,
  KanjiInfo,
  Vocab,
  VocabInput,
} from "./types";
import type { StudyMode } from "./decks";

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

// Returns how many rows were created, updated, or skipped as already-present
// duplicates (the server dedups on kanji), so callers can phrase their toast.
export async function createVocab(
  rows: VocabInput | VocabInput[],
  options: { updateExisting?: boolean } = {}
): Promise<{
  inserted: number;
  updated: number;
  skipped: number;
  syncWarning: string | null;
}> {
  const body = Array.isArray(rows)
    ? { rows, update_existing: options.updateExisting === true }
    : { ...rows, update_existing: options.updateExisting === true };
  const res = await fetch("/api/vocab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to save");
  return {
    inserted: (json.inserted as number) ?? 0,
    updated: (json.updated as number) ?? 0,
    skipped: (json.skipped as number) ?? 0,
    syncWarning:
      typeof json.sync_warning === "string" ? json.sync_warning : null,
  };
}

export async function updateVocab(
  id: string,
  patch: Partial<VocabInput>
): Promise<{ data: Vocab; syncWarning: string | null }> {
  const res = await fetch(`/api/vocab/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to update");
  return {
    data: json.data as Vocab,
    syncWarning:
      typeof json.sync_warning === "string" ? json.sync_warning : null,
  };
}

export async function deleteVocab(id: string): Promise<void> {
  const res = await fetch(`/api/vocab/${id}`, { method: "DELETE" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to delete");
}

// Record a flashcard review. The server computes the next schedule and returns
// the updated card (with its new due_at / interval). Pass `practice: true` for a
// cram review of a not-yet-due card — the server logs it but leaves the schedule
// untouched (the card comes back unchanged), so cramming can't inflate intervals.
export async function reviewVocab(
  id: string,
  grade: Grade,
  opts: { practice?: boolean; mode?: StudyMode } = {}
): Promise<Vocab> {
  const res = await fetch(`/api/vocab/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grade,
      practice: opts.practice ?? false,
      mode: opts.mode ?? "word",
    }),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to save review");
  return json.data as Vocab;
}

// --- Smart Kanji deck ---

// The user's kanji-in-word cards (auto-populated from study_as_kanji words).
export async function fetchKanjiCards(): Promise<KanjiCard[]> {
  const res = await fetch("/api/kanji-cards", { cache: "no-store" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to load kanji cards");
  return (json.data as KanjiCard[]) ?? [];
}

// Fully reconcile the smart deck from the user's current words/selections.
export async function syncKanjiCards(): Promise<{
  created: number;
  updated: number;
  activated: number;
  deactivated: number;
}> {
  const res = await fetch("/api/kanji-cards/sync", { method: "POST" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to sync kanji deck");
  return {
    created: (json.created as number) ?? 0,
    updated: (json.updated as number) ?? 0,
    activated: (json.activated as number) ?? 0,
    deactivated: (json.deactivated as number) ?? 0,
  };
}

export async function reviewKanjiCard(
  id: string,
  grade: Grade,
  opts: { practice?: boolean } = {}
): Promise<KanjiCard> {
  const res = await fetch(`/api/kanji-cards/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grade, practice: opts.practice ?? false }),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to save review");
  return json.data as KanjiCard;
}

// Normalized kanjiapi.dev info for one character (readings, JLPT, example words).
export async function fetchKanji(char: string): Promise<KanjiInfo> {
  const res = await fetch(`/api/kanji/${encodeURIComponent(char)}`, {
    cache: "no-store",
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to load kanji");
  return json.data as KanjiInfo;
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
