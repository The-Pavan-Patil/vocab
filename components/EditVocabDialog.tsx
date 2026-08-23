"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateVocab } from "@/lib/api";
import { CATEGORIES, type Vocab, type VocabInput } from "@/lib/types";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The single "edit a word" surface. It started out inline in the List tab, but
// every study surface needs it too — a card you can't fix mid-session is a card
// you have to remember to come back to. `word` drives the whole dialog: pass a
// row to open it, null to close.
//
// `onSaved` hands back the row the server returned so a caller mid-session can
// patch its own copy instead of reloading (which would restart the session).
export default function EditVocabDialog({
  word,
  onClose,
  onSaved,
}: {
  word: Vocab | null;
  onClose: () => void;
  onSaved: (updated: Vocab) => void;
}) {
  const [draft, setDraft] = useState<VocabInput | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[] | null>(null);
  const [initialSelection, setInitialSelection] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  // Re-seed the form whenever a different word is opened, during render rather
  // than in an effect (the repo's "you might not need an effect" pattern).
  const [editingId, setEditingId] = useState<string | null>(null);

  if (word && word.id !== editingId) {
    setEditingId(word.id);
    setDraft({
      kanji: word.kanji,
      romaji: word.romaji ?? "",
      english: word.english ?? "",
      tips: word.tips ?? "",
      sentence: word.sentence ?? "",
      category: word.category ?? "",
      study_as_kanji: word.study_as_kanji ?? false,
      kanji_selection: word.kanji_selection ?? null,
    });
    setInitialSelection(word.kanji_selection ?? null);
    setDraftSelection(word.kanji_selection ?? null);
  }

  function close() {
    setEditingId(null);
    setDraft(null);
    setInitialSelection(null);
    setDraftSelection(null);
    onClose();
  }

  async function save() {
    if (!word || !draft) return;
    if (draft.study_as_kanji && draftSelection === null) {
      toast.info("Kanji details are still loading");
      return;
    }
    setBusy(true);
    try {
      const { data, syncWarning } = await updateVocab(word.id, {
        ...draft,
        // Preserve the curated set while the broad toggle is off. The sync marks
        // cards inactive, so re-enabling restores their existing schedules.
        kanji_selection: draftSelection,
      });
      close();
      onSaved(data);
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

  return (
    <Dialog
      open={word !== null}
      onOpenChange={(open) => {
        if (!open && !busy) close();
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
                <FieldLabel htmlFor="edit-english">English meaning</FieldLabel>
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
                <FieldLabel htmlFor="edit-sentence">Sentence</FieldLabel>
                <Textarea
                  id="edit-sentence"
                  className="jp"
                  rows={2}
                  value={draft.sentence ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, sentence: event.target.value })
                  }
                  placeholder="例: 毎朝ご飯を食べる。"
                />
                <FieldDescription>
                  An example of the word in use. Shown on the back of its
                  flashcards.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-category">Category</FieldLabel>
                <Select
                  value={draft.category || undefined}
                  onValueChange={(category) => setDraft({ ...draft, category })}
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
                    setDraft({ ...draft, study_as_kanji: studyAsKanji });
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
          <Button variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={save}
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
  );
}
