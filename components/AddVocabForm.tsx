"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createVocab } from "@/lib/api";
import { CATEGORIES, type VocabInput } from "@/lib/types";
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
  FieldDescription,
  FieldError,
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

const EMPTY: VocabInput = {
  kanji: "",
  romaji: "",
  english: "",
  tips: "",
  category: "noun",
};

export default function AddVocabForm({ onAdded }: { onAdded: () => void }) {
  const [form, setForm] = useState<VocabInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const set = (k: keyof VocabInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.kanji?.trim()) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setSaving(true);
    try {
      const { inserted } = await createVocab(form);
      if (inserted) {
        setForm({ ...EMPTY, category: form.category });
        toast.success("Saved", { description: "Added to your vocab list." });
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

            <Button
              type="submit"
              size="lg"
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? "Saving…" : "Add to vocab list"}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
