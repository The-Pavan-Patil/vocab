"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, ChevronDown, Loader2, Plus, Search } from "lucide-react";
import { createVocab, fetchDictionaryDetails, searchDictionary } from "@/lib/api";
import { entryToVocabInput } from "@/lib/dictionary";
import { isDraftDirty } from "@/lib/vocab-draft";
import { toastError, toastKanjiSyncWarning } from "@/lib/notify";
import {
  focusDialogOnOpen,
  useDesktopAutoFocus,
} from "@/hooks/use-desktop-autofocus";
import { setSearchParams, useSearchParam } from "@/hooks/use-search-param";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import {
  CATEGORIES,
  type DictDetails,
  type DictEntry,
  type Vocab,
  type VocabInput,
} from "@/lib/types";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import ConfirmDialog from "@/components/ConfirmDialog";
import ScreenHeader from "@/components/ScreenHeader";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
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
  // The saved (added or updated) row, for the page to patch into its list.
  onAdded: (saved: Vocab[]) => void;
  onRevealInList: (word: string) => void;
}) {
  const [query, setQuery] = useState("");
  // The query the current results are for (the input may have moved on).
  const [searched, setSearched] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(searchRef);
  // The last search is kept in the URL (?q=…): a reload or a shared link runs
  // it again. Read once, after hydration.
  const urlQuery = useSearchParam("q");
  const ranUrlQueryRef = useRef(false);
  useEffect(() => {
    if (ranUrlQueryRef.current || !urlQuery?.trim()) return;
    ranUrlQueryRef.current = true;
    setQuery(urlQuery);
    void search(urlQuery.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);
  const [entries, setEntries] = useState<DictEntry[]>([]);
  const [loading, setLoading] = useState(false);
  // The last search failed — shown as an error with Retry, not as "No
  // matches" (which would send the person off re-spelling a fine query).
  const [searchFailed, setSearchFailed] = useState(false);

  // Lazily-loaded details (examples + kanji) keyed by word.
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DictDetails>>({});
  const [detailsLoading, setDetailsLoading] = useState<string | null>(null);
  // Words whose details request failed — shown as an error with Retry rather
  // than as "no details" (which would hide the failure).
  const [detailsFailed, setDetailsFailed] = useState<Set<string>>(() => new Set());

  // Add-to-vocab dialog.
  const [draft, setDraft] = useState<VocabInput | null>(null);
  // The draft as it was opened, to tell whether closing loses edits.
  const [draftStart, setDraftStart] = useState<VocabInput | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [kanjiMissing, setKanjiMissing] = useState(false);
  const kanjiRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  // Kanji chosen in the dialog's breakdown (only when "study as kanji" is on).
  const [draftSelection, setDraftSelection] = useState<string[] | null>(null);
  const [draftInitialSelection, setDraftInitialSelection] = useState<
    string[] | null
  >(null);

  // Park the Add dialog while this tab is hidden by <Activity> (switching tabs,
  // or Back/Forward now that tabs are history entries). The dialog renders into
  // a portal on document.body — outside the Activity boundary — so display:none
  // on the panel wouldn't hide it. The draft itself is kept, and the dialog
  // comes back with the edits when the tab is shown again. Activity runs the
  // cleanup on hide and the effect again on show.
  const [parked, setParked] = useState(false);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setParked(false);
    return () => setParked(true);
  }, []);

  function runSearch(e: React.FormEvent) {
    e.preventDefault();
    ranUrlQueryRef.current = true;
    setSearchParams({ q: query.trim() || null });
    void search(query.trim());
  }

  async function search(q: string) {
    if (!q) return;
    setLoading(true);
    setSearched(q);
    setSearchFailed(false);
    setExpanded(null);
    try {
      setEntries(await searchDictionary(q));
    } catch (err) {
      toastError("Couldn’t search the dictionary", err, {
        retry: () => void search(q),
      });
      setEntries([]);
      setSearchFailed(true);
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
    await loadDetails(entry);
  }

  async function loadDetails(entry: DictEntry) {
    setDetailsLoading(entry.slug);
    setDetailsFailed((prev) => {
      const next = new Set(prev);
      next.delete(entry.word);
      return next;
    });
    try {
      const d = await fetchDictionaryDetails(entry.word);
      setDetails((prev) => ({ ...prev, [entry.word]: d }));
    } catch {
      setDetailsFailed((prev) => new Set(prev).add(entry.word));
    } finally {
      // Only clear our own spinner — another entry may have opened since.
      setDetailsLoading((current) => (current === entry.slug ? null : current));
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

    const opened: VocabInput = existing
      ? {
          ...dictionaryDraft,
          kanji: existing.kanji,
          romaji: existing.romaji ?? dictionaryDraft.romaji,
          english: existing.english ?? dictionaryDraft.english,
          tips: existing.tips ?? dictionaryDraft.tips,
          sentence: existing.sentence ?? dictionaryDraft.sentence,
          category: existing.category ?? dictionaryDraft.category,
          study_as_kanji: existing.study_as_kanji ?? false,
          kanji_selection: savedSelection,
        }
      : dictionaryDraft;
    setDraft(opened);
    setDraftStart(opened);
    setKanjiMissing(false);
    setDraftSelection(savedSelection);
    setDraftInitialSelection(savedSelection);
  }

  function closeDraft() {
    setDraft(null);
    setDraftStart(null);
    setConfirmDiscard(false);
    setKanjiMissing(false);
  }

  const expandedEntry = entries.find((entry) => entry.slug === expanded);

  const draftDirty =
    draft !== null && draftStart !== null && isDraftDirty(draftStart, draft);
  useBeforeUnload(draftDirty);

  // Esc, the overlay, the X and Cancel all land here.
  function requestCloseDraft() {
    if (saving) return;
    if (draftDirty) setConfirmDiscard(true);
    else closeDraft();
  }

  async function saveDraft() {
    if (!draft || saving) return;
    if (!draft.kanji.trim()) {
      setKanjiMissing(true);
      kanjiRef.current?.focus();
      return;
    }
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
      const { rows, inserted, updated, syncWarning } = await createVocab(
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
        toastKanjiSyncWarning("Word saved, but Kanji sync needs a retry", syncWarning);
      }
      closeDraft();
      onAdded(rows);
    } catch (err) {
      toastError("Couldn’t save the word", err, {
        nextStep: "Your edits are kept — try saving again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <ScreenHeader title="Dictionary">
        Japanese–English, from JMdict, KanjiDic and Tatoeba.
      </ScreenHeader>

      <form onSubmit={runSearch} className="flex gap-2">
        <InputGroup className="h-11 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            name="q"
            aria-label="Search the dictionary"
            autoComplete="off"
            // Romaji must reach Jisho lowercase and as typed — a phone's
            // auto-capital or autocorrect turns "taberu" into a miss.
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search English, 日本語, or romaji…"
          />
        </InputGroup>
        <Button type="submit" size="lg" className="h-11 px-4" disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>

      <p className="sr-only" aria-live="polite">
        {loading
          ? "Searching…"
          : searchFailed
            ? `Couldn’t search the dictionary for ${searched}`
            : searched !== null
              ? `${entries.length} ${entries.length === 1 ? "result" : "results"} for ${searched}`
              : ""}
      </p>
      {/* The open entry's details arrive asynchronously; say when they do
          (or don't) — the panel itself isn't a live region. */}
      <p className="sr-only" aria-live="polite">
        {expandedEntry === undefined
          ? ""
          : detailsLoading === expandedEntry.slug
            ? "Loading examples and kanji…"
            : detailsFailed.has(expandedEntry.word)
              ? "Couldn’t load examples and kanji for this word."
              : details[expandedEntry.word]
                ? "Examples and kanji loaded."
                : ""}
      </p>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : searched === null ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpen />
            </EmptyMedia>
            <EmptyTitle>Look up a Japanese word</EmptyTitle>
            <EmptyDescription>
              Search by English meaning, Japanese (kanji or kana) or romaji.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : searchFailed ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Couldn’t reach the dictionary</EmptyTitle>
            <EmptyDescription className="break-words">
              The search for “{searched}” didn’t go through. Check your
              connection, then try again.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={() => void search(searched)}>
            Try again
          </Button>
        </Empty>
      ) : entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matches</EmptyTitle>
            <EmptyDescription className="break-words">
              Nothing found for “{searched}”. Try another spelling.
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
                      {/* Each result is a heading, so heading navigation
                          skims the words (and its Kanji / Examples h3s
                          belong to it). */}
                      <h2 lang="ja" translate="no" className="jp text-3xl font-medium break-words">
                        {entry.word}
                      </h2>
                      <div className="mt-0.5 text-muted-foreground">
                        {entry.reading && (
                          <span lang="ja" translate="no" className="jp">{entry.reading}</span>
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
                      ) : detailsFailed.has(entry.word) ? (
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          Couldn’t load examples and kanji for this word.
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void loadDetails(entry)}
                          >
                            Retry
                          </Button>
                        </div>
                      ) : d ? (
                        <div className="flex flex-col gap-4">
                          {d.kanji.length > 0 && (
                            <div className="flex flex-col gap-2">
                              <h3 className="text-sm font-semibold">Kanji</h3>
                              {d.kanji.map((k) => (
                                <div key={k.char} className="flex gap-3">
                                  <span lang="ja" translate="no" className="jp text-2xl">{k.char}</span>
                                  <div className="text-sm">
                                    <div>{k.meaning}</div>
                                    <div className="text-muted-foreground">
                                      {k.kunyomi.length > 0 && (
                                        <span lang="ja" translate="no" className="jp">
                                          訓 {k.kunyomi.join("、")}{" "}
                                        </span>
                                      )}
                                      {k.onyomi.length > 0 && (
                                        <span lang="ja" translate="no" className="jp">
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
                              <h3 className="text-sm font-semibold">Examples</h3>
                              {d.examples.map((ex, i) => (
                                <div key={i} className="text-sm">
                                  <div lang="ja" translate="no" className="jp">{ex.japanese}</div>
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
      <Dialog
        open={draft !== null && !parked}
        onOpenChange={(o) => {
          if (!o) requestCloseDraft();
        }}
      >
        <DialogContent
          className="overflow-hidden"
          onOpenAutoFocus={(event) =>
            focusDialogOnOpen(event, kanjiRef.current)
          }
        >
          {/* A real form, so Enter in a field saves like the Add tab (the
              footer's Save is its submit button). -mx-1 px-1: room for the
              fields' focus rings inside the scroller, which would otherwise
              clip their sides. */}
          <form
            id="dictionary-add-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveDraft();
            }}
            className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1"
          >
            <DialogHeader>
              <DialogTitle>Add to vocab list</DialogTitle>
              <DialogDescription>
                Tweak anything (e.g. add a Marathi tip) before saving.
              </DialogDescription>
            </DialogHeader>
            {draft && (
              <FieldGroup>
                <Field data-invalid={kanjiMissing || undefined}>
                  <FieldLabel htmlFor="d-kanji">Kanji / Word</FieldLabel>
                  <Input
                    ref={kanjiRef}
                    id="d-kanji"
                    name="kanji"
                    lang="ja"
                    autoComplete="off"
                    spellCheck={false}
                    className="jp text-lg"
                    value={draft.kanji}
                    aria-invalid={kanjiMissing || undefined}
                    aria-describedby={kanjiMissing ? "d-kanji-error" : undefined}
                    onChange={(e) => {
                      setDraftSelection(null);
                      setDraftInitialSelection(null);
                      setKanjiMissing(false);
                      setField("kanji", e.target.value);
                    }}
                  />
                  <FieldError id="d-kanji-error">
                    {kanjiMissing ? "Enter the word before saving." : undefined}
                  </FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-romaji">Romaji</FieldLabel>
                  <Input
                    id="d-romaji"
                    name="romaji"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.romaji ?? ""}
                    onChange={(e) => setField("romaji", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-english">English meaning</FieldLabel>
                  <Input
                    id="d-english"
                    name="english"
                    autoComplete="off"
                    value={draft.english ?? ""}
                    onChange={(e) => setField("english", e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-tips">Tip (Marathi)</FieldLabel>
                  <Input
                    id="d-tips"
                    name="tips"
                    lang="mr"
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.tips ?? ""}
                    onChange={(e) => setField("tips", e.target.value)}
                    placeholder="e.g. खाणे…"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="d-sentence">Sentence</FieldLabel>
                  <Textarea
                    id="d-sentence"
                    name="sentence"
                    lang="ja"
                    autoComplete="off"
                    spellCheck={false}
                    className="jp"
                    rows={2}
                    value={draft.sentence ?? ""}
                    onChange={(e) => setField("sentence", e.target.value)}
                    placeholder="e.g. 毎朝ご飯を食べる。"
                  />
                  <FieldDescription>
                    Shown on the back of this word’s flashcards.
                  </FieldDescription>
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
                {/* The whole row is the label (no dead zones); the switch is
                    named by the title alone. */}
                <FieldLabel htmlFor="d-study-kanji">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle id="d-study-kanji-title">
                        Also study as Kanji
                      </FieldTitle>
                      <FieldDescription id="d-study-kanji-desc">
                        Adds a kanji-only card to Flashcards → Word Kanji, and
                        its kanji to Smart Kanji.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="d-study-kanji"
                      aria-labelledby="d-study-kanji-title"
                      aria-describedby="d-study-kanji-desc"
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
                </FieldLabel>
                {draft.study_as_kanji && (
                  <KanjiBreakdown
                    word={draft.kanji}
                    initialSelection={draftInitialSelection}
                    onChange={setDraftSelection}
                  />
                )}
              </FieldGroup>
            )}
          </form>
          <DialogFooter className="shrink-0">
            <Button
              variant="ghost"
              onClick={requestCloseDraft}
              disabled={saving}
            >
              Cancel
            </Button>
            {/* aria-disabled, not disabled, so focus stays put while it
                saves; saveDraft() guards both states. */}
            <Button
              type="submit"
              form="dictionary-add-form"
              aria-disabled={
                saving ||
                (draft?.study_as_kanji === true && draftSelection === null) ||
                undefined
              }
              className="aria-disabled:opacity-50"
            >
              {saving && <Spinner data-icon="inline-start" aria-hidden />}
              {saving
                ? "Saving…"
                : draft?.study_as_kanji && draftSelection === null
                  ? "Loading kanji…"
                  : "Save to list"}
            </Button>
          </DialogFooter>
        </DialogContent>

        <ConfirmDialog
          open={confirmDiscard && !parked}
          title="Discard this word?"
          description="Your edits haven’t been saved to your list."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          destructive
          onConfirm={closeDraft}
          onCancel={() => setConfirmDiscard(false)}
        />
      </Dialog>
    </div>
  );
}
