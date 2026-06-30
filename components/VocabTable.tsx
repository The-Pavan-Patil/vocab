"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Languages, Pencil, Search, Trash2, X } from "lucide-react";
import { deleteVocab, updateVocab } from "@/lib/api";
import { CATEGORIES, COLUMNS, type Vocab, type VocabInput } from "@/lib/types";
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

export default function VocabTable({
  vocab,
  onChanged,
}: {
  vocab: Vocab[];
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<VocabInput | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vocab.filter((v) => {
      if (cat !== "all" && v.category !== cat) return false;
      if (!q) return true;
      return [v.kanji, v.romaji, v.english, v.tips, v.category]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [vocab, query, cat]);

  function startEdit(v: Vocab) {
    setEditId(v.id);
    setDraft({
      kanji: v.kanji,
      romaji: v.romaji ?? "",
      english: v.english ?? "",
      tips: v.tips ?? "",
      category: v.category ?? "",
      study_as_kanji: v.study_as_kanji ?? false,
    });
  }

  function cancelEdit() {
    setEditId(null);
    setDraft(null);
  }

  async function saveEdit() {
    if (!editId || !draft) return;
    setBusy(true);
    try {
      await updateVocab(editId, draft);
      cancelEdit();
      onChanged();
      toast.success("Changes saved");
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
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </InputGroup>

        <Select value={cat} onValueChange={setCat}>
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
                ? "Add your first word from the Add tab."
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
              {filtered.map((v) =>
                editId === v.id && draft ? (
                  <TableRow key={v.id} className="bg-accent/30">
                    {COLUMNS.map((c) => (
                      <TableCell key={c.key} className="align-top">
                        {c.key === "category" ? (
                          <Select
                            value={draft.category || undefined}
                            onValueChange={(val) =>
                              setDraft({ ...draft, category: val })
                            }
                          >
                            <SelectTrigger size="sm" className="w-full">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {CATEGORIES.map((x) => (
                                  <SelectItem key={x} value={x}>
                                    {x}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            className={c.key === "kanji" ? "jp" : undefined}
                            value={(draft[c.key] as string) ?? ""}
                            onChange={(e) =>
                              setDraft({ ...draft, [c.key]: e.target.value })
                            }
                          />
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="align-top text-center">
                      <Switch
                        aria-label="Study as Kanji"
                        className="mt-2"
                        checked={draft.study_as_kanji ?? false}
                        onCheckedChange={(val) =>
                          setDraft({ ...draft, study_as_kanji: val })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          onClick={saveEdit}
                          disabled={busy}
                          aria-label="Save"
                        >
                          <Check aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={cancelEdit}
                          aria-label="Cancel"
                        >
                          <X aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
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
                          aria-label="Edit"
                        >
                          <Pencil aria-hidden />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => confirmDelete(v)}
                          disabled={busy}
                          aria-label="Delete"
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
