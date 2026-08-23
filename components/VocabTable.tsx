"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Languages, Pencil, Search, Trash2 } from "lucide-react";
import { deleteVocab } from "@/lib/api";
import { CATEGORIES, COLUMNS, type Vocab } from "@/lib/types";
import EditVocabDialog from "@/components/EditVocabDialog";
import { Button } from "@/components/ui/button";
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
  const [editing, setEditing] = useState<Vocab | null>(null);
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
      return [v.kanji, v.romaji, v.english, v.tips, v.sentence, v.category]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [vocab, activeQuery, activeCat]);

  function finishReveal() {
    if (revealWord) setHandledRevealId(revealWord.requestId);
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
                  <TableCell className="jp max-w-[18rem] truncate" title={v.sentence ?? undefined}>
                    {v.sentence}
                  </TableCell>
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
                        onClick={() => setEditing(v)}
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

      <EditVocabDialog
        word={editing}
        onClose={() => setEditing(null)}
        onSaved={onChanged}
      />
    </div>
  );
}
