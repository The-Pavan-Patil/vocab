"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { createVocab } from "@/lib/api";
import { toastError, toastKanjiSyncWarning } from "@/lib/notify";
import { CATEGORIES, type Vocab, type VocabInput } from "@/lib/types";
import { useDesktopAutoFocus } from "@/hooks/use-desktop-autofocus";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { isDraftDirty } from "@/lib/vocab-draft";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import ScreenHeader from "@/components/ScreenHeader";
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
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY: VocabInput = {
  kanji: "",
  romaji: "",
  english: "",
  tips: "",
  sentence: "",
  category: "noun",
  study_as_kanji: false,
};

export default function AddVocabForm({
  onAdded,
  onRevealInList,
}: {
  // The saved row, for the page to add to its list.
  onAdded: (saved: Vocab[]) => void;
  // Jump to the List tab filtered to a word (for "already in your list").
  onRevealInList?: (word: string) => void;
}) {
  const [form, setForm] = useState<VocabInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // The kanji the user chose to study, reported by <KanjiBreakdown> (only
  // meaningful while "study as kanji" is on).
  const [kanjiSelection, setKanjiSelection] = useState<string[] | null>(null);
  const kanjiRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(kanjiRef);
  // A half-typed word survives tab switches, but not a reload — ask first.
  useBeforeUnload(isDraftDirty({ ...EMPTY, category: form.category }, form));

  const set = (k: keyof VocabInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!form.kanji?.trim()) {
      setInvalid(true);
      // The button may be a long scroll below the field — bring the error to
      // the person instead of leaving it off-screen.
      kanjiRef.current?.focus();
      return;
    }
    if (form.study_as_kanji && kanjiSelection === null) {
      toast.info("Kanji details are still loading");
      return;
    }
    setInvalid(false);
    setSaving(true);
    try {
      // When studying as kanji, persist exactly the kanji the user left on.
      const kanji_selection = form.study_as_kanji ? kanjiSelection : null;
      const { rows, inserted, syncWarning } = await createVocab({
        ...form,
        kanji_selection,
      });
      if (inserted) {
        setForm({ ...EMPTY, category: form.category });
        setKanjiSelection(null);
        // Ready for the next word. Desktop only — on a phone this would pop
        // the keyboard back up after every save.
        if (window.matchMedia("(pointer: fine)").matches) {
          kanjiRef.current?.focus();
        }
        toast.success("Saved", { description: "Added to your vocab list." });
        if (syncWarning) {
          toastKanjiSyncWarning("Saved, but Kanji sync needs a retry", syncWarning);
        }
        onAdded(rows);
      } else {
        // Same word is already saved — keep the form so it can be tweaked.
        const word = form.kanji.trim();
        toast.info("Already in your list", {
          description: `${word} is saved already — edit it from the list to change it.`,
          action: onRevealInList
            ? { label: "View in list", onClick: () => onRevealInList(word) }
            : undefined,
        });
      }
    } catch (e) {
      toastError("Couldn’t save the word", e, {
        nextStep: "It’s still in the form — try adding it again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <ScreenHeader title="Add a word">
        Only the word itself is required. Fill in the rest whenever you like.
      </ScreenHeader>
      <Card>
        <CardContent>
          <form onSubmit={submit}>
            <FieldGroup>
              <Field data-invalid={invalid || undefined}>
                <FieldLabel htmlFor="kanji">Kanji / Word</FieldLabel>
                <Input
                  ref={kanjiRef}
                  id="kanji"
                  name="kanji"
                  lang="ja"
                  autoComplete="off"
                  spellCheck={false}
                  className="jp h-12 text-2xl sm:text-3xl"
                  value={form.kanji}
                  onChange={(e) => {
                    set("kanji", e.target.value);
                    if (form.study_as_kanji) setKanjiSelection(null);
                    if (invalid) setInvalid(false);
                  }}
                  placeholder="e.g. 食べる…"
                  aria-invalid={invalid || undefined}
                  aria-describedby={invalid ? "kanji-error" : undefined}
                />
                <FieldError id="kanji-error">
                  {invalid ? "Please enter a word." : undefined}
                </FieldError>
              </Field>

              <Field>
                <FieldLabel htmlFor="romaji">Romaji</FieldLabel>
                <Input
                  id="romaji"
                  name="romaji"
                  autoComplete="off"
                  spellCheck={false}
                  value={form.romaji ?? ""}
                  onChange={(e) => set("romaji", e.target.value)}
                  placeholder="e.g. taberu…"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="english">English meaning</FieldLabel>
                <Input
                  id="english"
                  name="english"
                  autoComplete="off"
                  value={form.english ?? ""}
                  onChange={(e) => set("english", e.target.value)}
                  placeholder="e.g. to eat…"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="tips">Tip (Marathi)</FieldLabel>
                <Input
                  id="tips"
                  name="tips"
                  lang="mr"
                  autoComplete="off"
                  spellCheck={false}
                  value={form.tips ?? ""}
                  onChange={(e) => set("tips", e.target.value)}
                  placeholder="e.g. खाणे…"
                />
                <FieldDescription>
                  A mnemonic or meaning in your native language.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="sentence">Sentence</FieldLabel>
                <Textarea
                  id="sentence"
                  name="sentence"
                  lang="ja"
                  autoComplete="off"
                  spellCheck={false}
                  className="jp"
                  rows={2}
                  value={form.sentence ?? ""}
                  onChange={(e) => set("sentence", e.target.value)}
                  placeholder="e.g. 毎朝ご飯を食べる。"
                />
                <FieldDescription>
                  An example of the word in use. Shown on the back of its
                  flashcards.
                </FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="category">Category</FieldLabel>
                <Select
                  value={form.category ?? undefined}
                  onValueChange={(v) => set("category", v)}
                >
                  <SelectTrigger id="category" className="w-full">
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

              {/* The whole row is the label, so the description and the gap
                  toggle the switch too. */}
              <FieldLabel htmlFor="study_as_kanji">
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle id="study_as_kanji-title">
                      Also study as Kanji
                    </FieldTitle>
                    <FieldDescription id="study_as_kanji-desc">
                      Adds a kanji-only card (no reading shown) to Flashcards →
                      Word Kanji, and its kanji to Smart Kanji, each with its
                      own review schedule.
                    </FieldDescription>
                  </FieldContent>
                  {/* Named by the title alone (the wrapping label would read
                      the description into the name too). */}
                  <Switch
                    id="study_as_kanji"
                    aria-labelledby="study_as_kanji-title"
                    aria-describedby="study_as_kanji-desc"
                    checked={form.study_as_kanji ?? false}
                    onCheckedChange={(studyAsKanji) => {
                      if (studyAsKanji) setKanjiSelection(null);
                      setForm((current) => ({
                        ...current,
                        study_as_kanji: studyAsKanji,
                      }));
                    }}
                  />
                </Field>
              </FieldLabel>

              {form.study_as_kanji && (
                <KanjiBreakdown
                  word={form.kanji ?? ""}
                  onChange={setKanjiSelection}
                />
              )}

              {/* aria-disabled, not disabled: a disabled button drops keyboard
                  focus to <body> mid-save. submit() guards both states. */}
              <Button
                type="submit"
                size="lg"
                aria-disabled={
                  saving ||
                  (form.study_as_kanji === true && kanjiSelection === null) ||
                  undefined
                }
                className="w-full aria-disabled:opacity-50 sm:w-auto"
              >
                {saving && <Spinner data-icon="inline-start" aria-hidden />}
                {saving
                  ? "Saving…"
                  : form.study_as_kanji && kanjiSelection === null
                    ? "Loading kanji…"
                    : "Add to vocab list"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
