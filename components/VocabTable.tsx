"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Languages, Pencil, Search, Trash2 } from "lucide-react";
import { deleteVocab, updateVocab } from "@/lib/api";
import { CATEGORIES, COLUMNS, type Vocab, type VocabInput } from "@/lib/types";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
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

export default function VocabTable({
  vocab,
  onChanged,
  revealWord,
}: {
  vocab: Vocab[];
  onChanged: () => void;
  revealWord?: { word: string; requestId: number } | null;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VocabInput | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[] | null>(null);
  const [initialSelection, setInitialSelection] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [handledRevealId, setHandledRevealId] = useState<number | null>(null);

  const showingReveal =
    revealWord !== null &&
    revealWord !== undefined &&
    revealWord.requestId !== handledRevealId;
  const activeQuery = showingReveal ? revealWord.word : query;
  const activeCat = showingReveal ? "all" : cat;

  const filtered = useMemo(() => {
    const q = activeQuery.trim().toLowerCase();
    return vocab.filter((v) => {
      if (activeCat !== "all" && v.category !== activeCat) return false;
      if (!q) return true;
      return [v.kanji, v.romaji, v.english, v.tips, v.category]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [vocab, activeQuery, activeCat]);

  function finishReveal() {
    if (revealWord) setHandledRevealId(revealWord.requestId);
  }

  function startEdit(v: Vocab) {
    setEditId(v.id);
    setDraft({
      kanji: v.kanji,
      romaji: v.romaji ?? "",
      english: v.english ?? "",
      tips: v.tips ?? "",
      category: v.category ?? "",
      study_as_kanji: v.study_as_kanji ?? false,
      kanji_selection: v.kanji_selection ?? null,
    });
    setInitialSelection(v.kanji_selection ?? null);
    setDraftSelection(v.kanji_selection ?? null);
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
    setInitialSelection(null);
    setDraftSelection(null);
  }

  async function saveEdit() {
    if (!editId || !draft) return;
    if (draft.study_as_kanji && draftSelection === null) {
      toast.info("Kanji details are still loading");
      return;
    }
    setBusy(true);
    try {
      const { syncWarning } = await updateVocab(editId, {
        ...draft,
        // Preserve the curated set while the broad toggle is off. The sync marks
        // cards inactive, so re-enabling restores their existing schedules.
        kanji_selection: draftSelection,
      });
      cancelEdit();
      onChanged();
      toast.success("Changes saved");
      if (syncWarning) {
        toast.warning("Changes saved, but Kanji sync needs a retry", {
          description: syncWarning,
        });
      }
    } catch (e) {
      toast.error("Couldn’t save", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function doDelete(id: string) {
    setBusy(true);
    try {
      await deleteVocab(id);
      onChanged();
      toast.success("Word deleted");
    } catch (e) {
      toast.error("Couldn’t delete", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(v: Vocab) {
    toast("Delete this word?", {
      description: v.kanji,
      action: { label: "Delete", onClick: () => doDelete(v.id) },
      cancel: { label: "Keep", onClick: () => {} },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-[180px] flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search words…"
            value={activeQuery}
            onChange={(event) => {
              setQuery(event.target.value);
              setCat(activeCat);
              finishReveal();
            }}
          />
        </InputGroup>

        <Select
          value={activeCat}
          onValueChange={(category) => {
            setQuery(activeQuery);
            setCat(category);
            finishReveal();
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/api/export/docx">
              <Download aria-hidden />
              .docx
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export/pdf">
              <Download aria-hidden />
              PDF
            </a>
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Showing {filtered.length} of {vocab.length} words
      </p>

      {filtered.length === 0 ? (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No words found</EmptyTitle>
            <EmptyDescription>
              {vocab.length === 0
                ? "Add your first word from the Dictionary or Add tab."
                : "Try a different search or category."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableHead key={c.key}>{c.label}</TableHead>
                ))}
                <TableHead className="w-16 text-center">Kanji</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="jp text-base font-medium">
                    {v.kanji}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {v.romaji}
                  </TableCell>
                  <TableCell>{v.english}</TableCell>
                  <TableCell className="jp">{v.tips}</TableCell>
                  <TableCell>
                    {v.category && (
                      <Badge variant="secondary">{v.category}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {v.study_as_kanji && (
                      <Languages
                        className="mx-auto size-4 text-primary"
                        aria-label="In the Kanji deck"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(v)}
                        aria-label={`Edit ${v.kanji}`}
                      >
                        <Pencil aria-hidden />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => confirmDelete(v)}
                        disabled={busy}
                        aria-label={`Delete ${v.kanji}`}
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={editId !== null}
        onOpenChange={(open) => {
          if (!open && !busy) cancelEdit();
        }}
      >
        <DialogContent className="overflow-hidden sm:max-w-lg">
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit word</DialogTitle>
              <DialogDescription>
                Update the word and choose which of its kanji should be added to
                your Kanji study deck.
              </DialogDescription>
            </DialogHeader>

            {draft && (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="edit-kanji">Kanji / Word</FieldLabel>
                  <Input
                    id="edit-kanji"
                    className="jp text-lg"
                    value={draft.kanji}
                    onChange={(event) => {
                      setDraftSelection(null);
                      setInitialSelection(null);
                      setDraft({ ...draft, kanji: event.target.value });
                    }}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-romaji">Romaji</FieldLabel>
                  <Input
                    id="edit-romaji"
                    value={draft.romaji ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, romaji: event.target.value })
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-english">
                    English meaning
                  </FieldLabel>
                  <Input
                    id="edit-english"
                    value={draft.english ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, english: event.target.value })
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-tips">Tip (Marathi)</FieldLabel>
                  <Input
                    id="edit-tips"
                    value={draft.tips ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, tips: event.target.value })
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-category">Category</FieldLabel>
                  <Select
                    value={draft.category || undefined}
                    onValueChange={(category) =>
                      setDraft({ ...draft, category })
                    }
                  >
                    <SelectTrigger id="edit-category" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {category}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="edit-study-kanji">
                      Also study as Kanji
                    </FieldLabel>
                    <FieldDescription>
                      Turn this on to choose the individual kanji for the study
                      deck.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="edit-study-kanji"
                    checked={draft.study_as_kanji ?? false}
                    onCheckedChange={(studyAsKanji) => {
                      if (studyAsKanji) {
                        setInitialSelection(draftSelection);
                      }
                      setDraft({
                        ...draft,
                        study_as_kanji: studyAsKanji,
                      });
                    }}
                  />
                </Field>

                {draft.study_as_kanji && (
                  <KanjiBreakdown
                    word={draft.kanji}
                    initialSelection={initialSelection}
                    onChange={setDraftSelection}
                  />
                )}
              </FieldGroup>
            )}
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={cancelEdit} disabled={busy}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={
                busy ||
                !draft?.kanji.trim() ||
                (draft.study_as_kanji === true && draftSelection === null)
              }
            >
              {busy
                ? "Saving…"
                : draft?.study_as_kanji && draftSelection === null
                  ? "Loading kanji…"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
