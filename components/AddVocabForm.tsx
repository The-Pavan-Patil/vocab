"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createVocab } from "@/lib/api";
import { CATEGORIES, type VocabInput } from "@/lib/types";
import KanjiBreakdown from "@/components/KanjiBreakdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
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

const EMPTY: VocabInput = {
  kanji: "",
  romaji: "",
  english: "",
  tips: "",
  category: "noun",
  study_as_kanji: false,
};

export default function AddVocabForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<VocabInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  // The kanji the user chose to study, reported by <KanjiBreakdown> (only
  // meaningful while "study as kanji" is on).
  const [kanjiSelection, setKanjiSelection] = useState<string[] | null>(null);

  const set = (k: keyof VocabInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kanji?.trim()) {
      setInvalid(true);
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
      const { inserted, syncWarning } = await createVocab({
        ...form,
        kanji_selection,
      });
      if (inserted) {
        setForm({ ...EMPTY, category: form.category });
        setKanjiSelection(null);
        toast.success("Saved", { description: "Added to your vocab list." });
        if (syncWarning) {
          toast.warning("Saved, but Kanji sync needs a retry", {
            description: syncWarning,
          });
        }
        onAdded();
      } else {
        // Same word is already saved — keep the form so it can be tweaked.
        toast.info("Already in your list", { description: form.kanji });
      }
    } catch (e) {
      toast.error("Couldn’t save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Add a word</CardTitle>
        <CardDescription>
          Only the word itself is required — fill in the rest whenever you like.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={invalid || undefined}>
              <FieldLabel htmlFor="kanji">Kanji / Word</FieldLabel>
              <Input
                id="kanji"
                className="jp h-12 text-2xl sm:text-3xl"
                value={form.kanji}
                onChange={(e) => {
                  set("kanji", e.target.value);
                  if (form.study_as_kanji) setKanjiSelection(null);
                  if (invalid) setInvalid(false);
                }}
                placeholder="例: 食べる"
                aria-invalid={invalid || undefined}
                autoFocus
              />
              <FieldError>
                {invalid ? "Please enter a word." : undefined}
              </FieldError>
            </Field>

            <Field>
              <FieldLabel htmlFor="romaji">Romaji</FieldLabel>
              <Input
                id="romaji"
                value={form.romaji ?? ""}
                onChange={(e) => set("romaji", e.target.value)}
                placeholder="taberu"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="english">English meaning</FieldLabel>
              <Input
                id="english"
                value={form.english ?? ""}
                onChange={(e) => set("english", e.target.value)}
                placeholder="to eat"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="tips">Tip (Marathi)</FieldLabel>
              <Input
                id="tips"
                value={form.tips ?? ""}
                onChange={(e) => set("tips", e.target.value)}
                placeholder="खाणे"
              />
              <FieldDescription>
                A mnemonic or meaning in your native language.
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

            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="study_as_kanji">
                  Also study as Kanji
                </FieldLabel>
                <FieldDescription>
                  Adds a kanji-only card (no reading shown) to the Kanji tab,
                  with its own review schedule.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="study_as_kanji"
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

            {form.study_as_kanji && (
              <KanjiBreakdown
                word={form.kanji ?? ""}
                onChange={setKanjiSelection}
              />
            )}

            <Button
              type="submit"
              size="lg"
              disabled={
                saving ||
                (form.study_as_kanji === true && kanjiSelection === null)
              }
              className="w-full sm:w-auto"
            >
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
  );
}
