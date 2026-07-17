"use client";

import { useLayoutEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { createVocab, fetchDictionaryDetails, searchDictionary } from "@/lib/api";
import { entryToVocabInput } from "@/lib/dictionary";
import {
  CATEGORIES,
  type DictDetails,
  type DictEntry,
  type Vocab,
  type VocabInput,
} from "@/lib/types";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function jlptLabel(jlpt: string[]): string | null {
  // e.g. ["jlpt-n5", "jlpt-n4"] -> "N5"
  const levels = jlpt
    .map((j) => j.match(/n\d/i)?.[0]?.toUpperCase())
    .filter(Boolean) as string[];
  return levels.length ? levels.sort().reverse()[0] : null;
}

export default function DictionarySearch({
  vocab,
  onAdded,
  onRevealInList,
}: {
  vocab: Vocab[];
  onAdded: () => void;
  onRevealInList: (word: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState(false);
  const [entries, setEntries] = useState<DictEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Lazily-loaded details (examples + kanji) keyed by word.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DictDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);

  // Add-to-vocab dialog.
  const [draft, setDraft] = useState<VocabInput | null>(null);
  const [saving, setSaving] = useState(false);
  // Kanji chosen in the dialog's breakdown (only when "study as kanji" is on).
  const [draftSelection, setDraftSelection] = useState<string[] | null>(null);
  const [draftInitialSelection, setDraftInitialSelection] = useState<
    string[] | null
  >(null);

  // Close the Add dialog when this tab is hidden by <Activity>. The dialog
  // renders into a portal on document.body — outside the Activity boundary — so
  // display:none on the panel wouldn't hide it otherwise. Activity runs this
  // cleanup on hide.
  useLayoutEffect(() => () => setDraft(null), []);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    setExpanded(null);
    try {
      setEntries(await searchDictionary(q));
    } catch (err) {
      toast.error("Couldn’t search", { description: (err as Error).message });
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleDetails(entry: DictEntry) {
    if (expanded === entry.slug) {
      setExpanded(null);
      return;
    }
    setExpanded(entry.slug);
    if (details[entry.word]) return;
    setDetailsLoading(entry.slug);
    try {
      const d = await fetchDictionaryDetails(entry.word);
      setDetails((prev) => ({ ...prev, [entry.word]: d }));
    } catch {
      setDetails((prev) => ({
        ...prev,
        [entry.word]: { examples: [], kanji: [] },
      }));
    } finally {
      setDetailsLoading(null);
    }
  }

  const setField = (k: keyof VocabInput, v: string) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  function openDraft(entry: DictEntry) {
    const dictionaryDraft = entryToVocabInput(entry);
    const existing = vocab.find(
      (word) => word.kanji.trim() === dictionaryDraft.kanji.trim()
    );
    const savedSelection = existing?.kanji_selection ?? null;

    setDraft(
      existing
        ? {
            ...dictionaryDraft,
            kanji: existing.kanji,
            romaji: existing.romaji ?? dictionaryDraft.romaji,
            english: existing.english ?? dictionaryDraft.english,
            tips: existing.tips ?? dictionaryDraft.tips,
            category: existing.category ?? dictionaryDraft.category,
            study_as_kanji: existing.study_as_kanji ?? false,
            kanji_selection: savedSelection,
          }
        : dictionaryDraft
    );
    setDraftSelection(savedSelection);
    setDraftInitialSelection(savedSelection);
  }

  async function saveDraft() {
    if (!draft) return;
    if (draft.study_as_kanji && draftSelection === null) {
      toast.info("Kanji details are still loading");
      return;
    }
    setSaving(true);
    try {
      // Keep a saved selection while the broad toggle is off so turning the word
      // back on restores the same character cards and schedules.
      const kanji_selection = draftSelection;
      const word = draft.kanji.trim();
      const { inserted, updated, syncWarning } = await createVocab(
        { ...draft, kanji_selection },
        { updateExisting: true }
      );
      if (inserted) {
        toast.success("Added to vocab list", { description: word });
      } else {
        toast.info("Already in your list", {
          description: updated
            ? `${word} was updated with your latest changes.`
            : word,
          action: {
            label: "View in list",
            onClick: () => onRevealInList(word),
          },
        });
      }
      if (syncWarning) {
        toast.warning("Word saved, but Kanji sync needs a retry", {
          description: syncWarning,
        });
      }
      setDraft(null);
      onAdded();
    } catch (err) {
      toast.error("Couldn’t save", { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <form onSubmit={runSearch} className="flex gap-2">
        <InputGroup className="h-11 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search English, 日本語, or romaji…"
            autoFocus
          />
        </InputGroup>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : !searched ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>Look up a Japanese word</EmptyTitle>
            <EmptyDescription>
              Search by English meaning, Japanese (kanji/kana), or romaji. Results
              come from JMdict, KanjiDic and Tatoeba.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription>
              Nothing found for “{query.trim()}”. Try another spelling.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const jlpt = jlptLabel(entry.jlpt);
            const isOpen = expanded === entry.slug;
            const d = details[entry.word];
            return (
              <Card key={entry.slug}>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="jp text-3xl font-medium break-words">
                        {entry.word}
                      </div>
                      <div className="mt-0.5 text-muted-foreground">
                        {entry.reading && (
                          <span className="jp">{entry.reading}</span>
                        )}
                        {entry.romaji && (
                          <span className="ml-2 text-sm">{entry.romaji}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openDraft(entry)}
                      aria-label={`Add ${entry.word} to vocab`}
                    >
                      <Plus aria-hidden />
                      Add
                    </Button>
                  </div>

                  {(entry.isCommon || jlpt) && (
                    <div className="flex flex-wrap gap-1.5">
                      {entry.isCommon && (
                        <Badge variant="secondary">common</Badge>
                      )}
                      {jlpt && <Badge variant="secondary">{jlpt}</Badge>}
                    </div>
                  )}

                  <ol className="flex flex-col gap-2">
                    {entry.senses.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {i + 1}.
                        </span>
                        <div>
                          {s.partsOfSpeech.length > 0 && (
                            <span className="mr-2 text-xs text-muted-foreground italic">
                              {s.partsOfSpeech.join(", ")}
                            </span>
                          )}
                          <span>{s.englishDefinitions.join("; ")}</span>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleDetails(entry)}
                      aria-expanded={isOpen}
                    >
                      <ChevronDown
                        aria-hidden
                        className={isOpen ? "rotate-180 transition-transform" : "transition-transform"}
                      />
                      {isOpen ? "Hide details" : "Examples & kanji"}
                    </Button>
                  </div>

                  {isOpen && (
                    <>
                      <Separator />
                      {detailsLoading === entry.slug ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                          Loading examples and kanji…
                        </div>
                      ) : d ? (
                        <div className="flex flex-col gap-4">
                          {d.kanji.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <h4 className="text-sm font-semibold">Kanji</h4>
                              {d.kanji.map((k) => (
                                <div key={k.char} className="flex gap-3">
                                  <span className="jp text-2xl">{k.char}</span>
                                  <div className="text-sm">
                                    <div>{k.meaning}</div>
                                    <div className="text-muted-foreground">
                                      {k.kunyomi.length > 0 && (
                                        <span className="jp">
                                          訓 {k.kunyomi.join("、")}{" "}
                                        </span>
                                      )}
                                      {k.onyomi.length > 0 && (
                                        <span className="jp">
                                          音 {k.onyomi.join("、")}
                                        </span>
                                      )}
                                    </div>
                                    {(k.strokeCount || k.jlpt) && (
                                      <div className="text-xs text-muted-foreground">
                                        {k.strokeCount && `${k.strokeCount} strokes`}
                                        {k.strokeCount && k.jlpt && " · "}
                                        {k.jlpt}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {d.examples.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <h4 className="text-sm font-semibold">Examples</h4>
                              {d.examples.map((ex, i) => (
                                <div key={i} className="text-sm">
                                  <div className="jp">{ex.japanese}</div>
                                  {ex.romaji && (
                                    <div className="text-muted-foreground italic">
                                      {ex.romaji}
                                    </div>
                                  )}
                                  <div className="text-muted-foreground">
                                    {ex.english}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {d.kanji.length === 0 && d.examples.length === 0 && (
                            <p className="text-sm text-muted-foreground">
                              No examples or kanji details available.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add → quick edit dialog */}
      <Dialog open={draft !== null} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add to vocab list</DialogTitle>
              <DialogDescription>
                Tweak anything (e.g. add a Marathi tip) before saving.
              </DialogDescription>
            </DialogHeader>
            {draft && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="d-kanji">Kanji / Word</FieldLabel>
                  <Input
                    id="d-kanji"
                    className="jp text-lg"
                    value={draft.kanji}
                    onChange={(e) => {
                      setDraftSelection(null);
                      setDraftInitialSelection(null);
                      setField("kanji", e.target.value);
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-romaji">Romaji</FieldLabel>
                  <Input
                    id="d-romaji"
                    value={draft.romaji ?? ""}
                    onChange={(e) => setField("romaji", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-english">English meaning</FieldLabel>
                  <Input
                    id="d-english"
                    value={draft.english ?? ""}
                    onChange={(e) => setField("english", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-tips">Tip (Marathi)</FieldLabel>
                  <Input
                    id="d-tips"
                    value={draft.tips ?? ""}
                    onChange={(e) => setField("tips", e.target.value)}
                    placeholder="खाणे"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-category">Category</FieldLabel>
                  <Select
                    value={draft.category ?? undefined}
                    onValueChange={(v) => setField("category", v)}
                  >
                    <SelectTrigger id="d-category" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="d-study-kanji">
                      Also study as Kanji
                    </FieldLabel>
                    <FieldDescription>
                      Adds a kanji-only card to the Kanji tab.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="d-study-kanji"
                    checked={draft.study_as_kanji ?? false}
                    onCheckedChange={(studyAsKanji) => {
                      if (studyAsKanji) {
                        setDraftInitialSelection(draftSelection);
                      }
                      setDraft((current) =>
                        current
                          ? { ...current, study_as_kanji: studyAsKanji }
                          : current
                      );
                    }}
                  />
                </Field>
                {draft.study_as_kanji && (
                  <KanjiBreakdown
                    word={draft.kanji}
                    initialSelection={draftInitialSelection}
                    onChange={setDraftSelection}
                  />
                )}
              </FieldGroup>
            )}
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveDraft}
              disabled={
                saving ||
                (draft?.study_as_kanji === true && draftSelection === null)
              }
            >
              {saving
                ? "Saving…"
                : draft?.study_as_kanji && draftSelection === null
                  ? "Loading kanji…"
                  : "Save to list"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
