import type {
  DictDetails,
  DictEntry,
  DictMatchedForm,
  Grade,
  KanjiCard,
  KanjiDeckData,
  KanjiInfo,
  Vocab,
  VocabInput,
} from "./types";
import type { KanjiDeckParam, StudyMode } from "./decks";
import { announceKanjiCardsChanged } from "./kanji-cards-events";

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
// `redirect: false` for a fetch the person didn't ask for (a background
// refresh): it just throws, and their next action does the bouncing.
function ensureOk(
  res: Response,
  json: Record<string, unknown>,
  fallback: string,
  { redirect = true }: { redirect?: boolean } = {}
): void {
  if (res.ok) return;
  if (redirect && res.status === 401 && typeof window !== "undefined") {
    window.location.assign("/login");
  }
  throw new Error((json.error as string) ?? fallback);
}

export async function fetchVocab(
  options: { background?: boolean } = {}
): Promise<Vocab[]> {
  const res = await fetch("/api/vocab", { cache: "no-store" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to load vocab", {
    redirect: !options.background,
  });
  return json.data as Vocab[];
}

// Returns how many rows were created, updated, or skipped as already-present
// duplicates (the server dedups on kanji), so callers can phrase their toast,
// and the saved rows themselves (`rows`), so the page can patch its list
// instead of refetching it.
export async function createVocab(
  rows: VocabInput | VocabInput[],
  options: { updateExisting?: boolean } = {}
): Promise<{
  rows: Vocab[];
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
    rows: (json.data as Vocab[]) ?? [],
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
// the updated card (with its new due_at / interval). A review of a card the
// server finds not yet due (cramming, or stale data) is logged but leaves the
// schedule untouched (the card comes back unchanged), so early reviews can't
// inflate intervals. `practice` marks a cram review; the server's clock decides.
export async function reviewVocab(
  id: string,
  grade: Grade,
  opts: { reviewId: string; practice?: boolean; mode?: StudyMode }
): Promise<Vocab> {
  const res = await fetch(`/api/vocab/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grade,
      practice: opts.practice ?? false,
      mode: opts.mode ?? "word",
      reviewId: opts.reviewId,
    }),
  });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to save review");
  return json.data as Vocab;
}

// --- Smart Kanji + All Kanji decks ---

// The user's kanji-in-word cards (auto-populated from study_as_kanji words),
// with the kanji details their backs show.
export async function fetchKanjiCards(
  options: { background?: boolean } = {}
): Promise<KanjiDeckData> {
  const res = await fetch("/api/kanji-cards", { cache: "no-store" });
  const json = await parseJson(res);
  ensureOk(res, json, "Failed to load kanji cards", {
    redirect: !options.background,
  });
  return {
    cards: (json.data as KanjiCard[]) ?? [],
    kanji: (json.kanji as Record<string, KanjiInfo>) ?? {},
  };
}

// The kanji cards fetched ahead of the Smart Kanji section's first show, for
// the version of the words they were read at (`tag`, see useKanjiCards).
export type KanjiPrefetch = { tag: string; promise: Promise<KanjiDeckData> };

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
  announceKanjiCardsChanged();
  return {
    created: (json.created as number) ?? 0,
    updated: (json.updated as number) ?? 0,
    activated: (json.activated as number) ?? 0,
    deactivated: (json.deactivated as number) ?? 0,
  };
}

// Record a Smart Kanji ("smart") or All Kanji ("all") review — each deck keeps
// its own schedule on the card.
export async function reviewKanjiCard(
  id: string,
  grade: Grade,
  opts: { reviewId: string; practice?: boolean; deck: KanjiDeckParam }
): Promise<KanjiCard> {
  const res = await fetch(`/api/kanji-cards/${id}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grade,
      practice: opts.practice ?? false,
      reviewId: opts.reviewId,
      deck: opts.deck,
    }),
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

// The whole list as a Word or PDF file. Fetched (not a plain link) so a server
// error shows as a toast instead of replacing the app with a JSON page.
export async function exportList(format: "docx" | "pdf"): Promise<Blob> {
  const res = await fetch(`/api/export/${format}`, { cache: "no-store" });
  if (!res.ok) ensureOk(res, await parseJson(res), "Export failed");
  return res.blob();
}

// --- Dictionary (Takoboto-style search via Jisho/JMdict) ---

export async function searchDictionary(q: string): Promise<{
  results: DictEntry[];
  // Set when the query was a conjugated form (行った → 行く, "Past").
  matchedForm: DictMatchedForm | null;
}> {
  const res = await fetch(`/api/dictionary?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
  });
  const json = await parseJson(res);
  if (!res.ok) throw new Error((json.error as string) ?? "Search failed");
  return {
    results: (json.results as DictEntry[]) ?? [],
    matchedForm: (json.matchedForm as DictMatchedForm | null) ?? null,
  };
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
