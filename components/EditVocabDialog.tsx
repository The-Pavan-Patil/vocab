"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { updateVocab } from "@/lib/api";
import { CATEGORIES, type Vocab, type VocabInput } from "@/lib/types";
import { isDraftDirty } from "@/lib/vocab-draft";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { focusDialogOnOpen } from "@/hooks/use-desktop-autofocus";
import { toastError, toastKanjiSyncWarning } from "@/lib/notify";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
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
  // Save was pressed with the word cleared.
  const [kanjiMissing, setKanjiMissing] = useState(false);
  // Closing with unsaved edits asks first.
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const kanjiRef = useRef<HTMLInputElement>(null);
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
    setKanjiMissing(false);
    setConfirmDiscard(false);
    onClose();
  }

  const dirty =
    word !== null &&
    draft !== null &&
    isDraftDirty(
      { ...word, study_as_kanji: word.study_as_kanji ?? false },
      draft
    );
  useBeforeUnload(dirty);

  // Esc, the overlay, the X and Cancel all land here.
  function requestClose() {
    if (busy) return;
    if (dirty) setConfirmDiscard(true);
    else close();
  }

  async function save() {
    if (!word || !draft || busy) return;
    if (!draft.kanji.trim()) {
      setKanjiMissing(true);
      kanjiRef.current?.focus();
      return;
    }
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
        toastKanjiSyncWarning("Changes saved, but Kanji sync needs a retry", syncWarning);
      }
    } catch (e) {
      // No Retry action: it would replay this render's draft, even after the
      // dialog moved on. The dialog stays open with the edits instead.
      toastError("Couldn’t save your changes", e, {
        nextStep: "Your edits are still in the dialog — press Save to try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={word !== null}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <DialogContent
        className="overflow-hidden sm:max-w-lg"
        onOpenAutoFocus={(event) => focusDialogOnOpen(event, kanjiRef.current)}
      >
        {/* A real form, so Enter in a field saves (the footer's Save is its
            submit button). -mx-1 px-1: room for the fields' focus rings
            inside the scroller, which would otherwise clip their sides. */}
        <form
          id="edit-word-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1"
        >
          <DialogHeader>
            <DialogTitle>Edit word</DialogTitle>
            <DialogDescription>
              Update the word and choose which of its kanji should be added to
              your Kanji study deck.
            </DialogDescription>
          </DialogHeader>

          {draft && (
            <FieldGroup>
              <Field data-invalid={kanjiMissing || undefined}>
                <FieldLabel htmlFor="edit-kanji">Kanji / Word</FieldLabel>
                <Input
                  ref={kanjiRef}
                  id="edit-kanji"
                  name="kanji"
                  lang="ja"
                  autoComplete="off"
                  spellCheck={false}
                  className="jp text-lg"
                  value={draft.kanji}
                  aria-invalid={kanjiMissing || undefined}
                  aria-describedby={kanjiMissing ? "edit-kanji-error" : undefined}
                  onChange={(event) => {
                    setDraftSelection(null);
                    setInitialSelection(null);
                    setKanjiMissing(false);
                    setDraft({ ...draft, kanji: event.target.value });
                  }}
                />
                <FieldError id="edit-kanji-error">
                  {kanjiMissing ? "Enter the word before saving." : undefined}
                </FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="edit-romaji">Romaji</FieldLabel>
                <Input
                  id="edit-romaji"
                  name="romaji"
                  autoComplete="off"
                  spellCheck={false}
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
                  name="english"
                  autoComplete="off"
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
                  name="tips"
                  lang="mr"
                  autoComplete="off"
                  spellCheck={false}
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
                  name="sentence"
                  lang="ja"
                  autoComplete="off"
                  spellCheck={false}
                  className="jp"
                  rows={2}
                  value={draft.sentence ?? ""}
                  onChange={(event) =>
                    setDraft({ ...draft, sentence: event.target.value })
                  }
                  placeholder="e.g. 毎朝ご飯を食べる。"
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

              {/* The whole row is the label (no dead zones); the switch is
                  named by the title alone. */}
              <FieldLabel htmlFor="edit-study-kanji">
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle id="edit-study-kanji-title">
                      Also study as Kanji
                    </FieldTitle>
                    <FieldDescription id="edit-study-kanji-desc">
                      Turn this on to choose the individual kanji for the study
                      deck.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="edit-study-kanji"
                    aria-labelledby="edit-study-kanji-title"
                    aria-describedby="edit-study-kanji-desc"
                    checked={draft.study_as_kanji ?? false}
                    onCheckedChange={(studyAsKanji) => {
                      if (studyAsKanji) {
                        setInitialSelection(draftSelection);
                      }
                      setDraft({ ...draft, study_as_kanji: studyAsKanji });
                    }}
                  />
                </Field>
              </FieldLabel>

              {draft.study_as_kanji && (
                <KanjiBreakdown
                  word={draft.kanji}
                  initialSelection={initialSelection}
                  onChange={setDraftSelection}
                />
              )}
            </FieldGroup>
          )}
        </form>

        <DialogFooter className="shrink-0">
          <Button variant="ghost" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          {/* aria-disabled, not disabled, so focus stays put while it saves;
              save() guards both states. */}
          <Button
            type="submit"
            form="edit-word-form"
            aria-disabled={
              busy ||
              (draft?.study_as_kanji === true && draftSelection === null) ||
              undefined
            }
            className="aria-disabled:opacity-50"
          >
            {busy && <Spinner data-icon="inline-start" aria-hidden />}
            {busy
              ? "Saving…"
              : draft?.study_as_kanji && draftSelection === null
                ? "Loading kanji…"
                : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your changes?"
        description="Your edits to this word haven’t been saved."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={close}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Dialog>
  );
}
