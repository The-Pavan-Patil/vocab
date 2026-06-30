"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { createVocab, importFile, updateVocab } from "@/lib/api";
import {
  CATEGORIES,
  COLUMNS,
  type Vocab,
  type VocabInput,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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

// Build a PATCH that only carries non-empty cells, so updating a word already
// in the list never wipes fields the user filled in (e.g. their Marathi tips).
function nonEmptyPatch(r: VocabInput): Partial<VocabInput> {
  const patch: Partial<VocabInput> = {};
  (["kanji", "romaji", "english", "tips", "category"] as const).forEach((k) => {
    const v = (r[k] ?? "").toString().trim();
    if (v) patch[k] = v;
  });
  return patch;
}

export default function ImportPanel({
  vocab,
  onImported,
}: {
  vocab: Vocab[];
  onImported: () => void;
}) {
  const [rows, setRows] = useState<VocabInput[] | null>(null);
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [studyAllAsKanji, setStudyAllAsKanji] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Words already saved, keyed by trimmed kanji — the duplicate lookup.
  const existingByKanji = useMemo(() => {
    const m = new Map<string, Vocab>();
    for (const v of vocab) m.set(v.kanji.trim(), v);
    return m;
  }, [vocab]);

  const dupFor = (r: VocabInput): Vocab | undefined => {
    const k = (r.kanji ?? "").trim();
    return k ? existingByKanji.get(k) : undefined;
  };

  const allRows = rows ?? [];
  const newRows = allRows.filter(
    (r) => (r.kanji ?? "").trim() && !dupFor(r)
  );
  const dupRows = allRows.filter((r) => dupFor(r));
  const newCount = newRows.length;
  const dupCount = dupRows.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setFilename(file.name);
    try {
      const parsed = await importFile(file);
      setRows(parsed);
      if (parsed.length === 0)
        toast.error("Nothing to import", {
          description: "No rows could be parsed. Check the table format.",
        });
    } catch (e) {
      toast.error("Couldn’t read file", { description: (e as Error).message });
      setRows(null);
    } finally {
      setParsing(false);
    }
  }

  function editCell(i: number, key: keyof VocabInput, value: string) {
    setRows((rs) =>
      rs ? rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)) : rs
    );
  }

  function removeRow(i: number) {
    setRows((rs) => {
      if (!rs) return rs;
      const next = rs.filter((_, idx) => idx !== i);
      return next.length ? next : null;
    });
  }

  // Import only the NEW words; leave duplicates in the preview to update.
  async function importNew() {
    if (newCount === 0) return;
    setBusy(true);
    try {
      const { inserted: n } = await createVocab(
        newRows.map((r) => ({ ...r, study_as_kanji: studyAllAsKanji }))
      );
      toast.success(`Imported ${n} new word${n === 1 ? "" : "s"}`);
      setRows((rs) => {
        const remaining = (rs ?? []).filter((r) => dupFor(r));
        return remaining.length ? remaining : null;
      });
      onImported();
    } catch (e) {
      toast.error("Import failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  // Update one existing word from its (edited) row, then drop it.
  async function updateOne(i: number) {
    const r = allRows[i];
    const dup = r && dupFor(r);
    if (!dup) return;
    setBusy(true);
    try {
      await updateVocab(dup.id, nonEmptyPatch(r));
      toast.success("Updated", { description: r.kanji });
      removeRow(i);
      onImported();
    } catch (e) {
      toast.error("Update failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  // Update every duplicate at once.
  async function updateAll() {
    const targets = allRows.filter((r) => dupFor(r));
    if (targets.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        targets.map((r) => updateVocab(dupFor(r)!.id, nonEmptyPatch(r)))
      );
      toast.success(
        `Updated ${targets.length} existing word${targets.length === 1 ? "" : "s"}`
      );
      setRows((rs) => {
        const remaining = (rs ?? []).filter((r) => !dupFor(r));
        return remaining.length ? remaining : null;
      });
      onImported();
    } catch (e) {
      toast.error("Update failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls,.docx,.pdf"
        onChange={onPick}
        className="sr-only"
      />

      <Empty className="rounded-xl border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {parsing ? <Loader2 className="animate-spin" /> : <FileUp />}
          </EmptyMedia>
          <EmptyTitle>
            {parsing ? `Reading ${filename}…` : "Import a word list"}
          </EmptyTitle>
          <EmptyDescription>
            Upload a CSV, Excel (.xlsx/.xls), Word (.docx) or PDF with the
            columns: Kanji · Romaji · English · Tips (Marathi) · Category.
            Multiple sections/tables are all read.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="mt-2"
        >
          <FileUp aria-hidden />
          Choose file
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          CSV and Excel parse most reliably. PDF tables are best-effort — review
          the preview before importing.
        </p>
      </Empty>

      {rows && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">
                Preview — {rows.length} row{rows.length === 1 ? "" : "s"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {newCount} new · {dupCount} already in your list. Edit any cell
                first.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {newCount > 0 && (
                <label
                  htmlFor="import-study-kanji"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Switch
                    id="import-study-kanji"
                    checked={studyAllAsKanji}
                    onCheckedChange={setStudyAllAsKanji}
                  />
                  Study all as Kanji
                </label>
              )}
              {dupCount > 0 && (
                <Button
                  variant="outline"
                  onClick={updateAll}
                  disabled={busy}
                >
                  <RefreshCw aria-hidden />
                  Update {dupCount} existing
                </Button>
              )}
              <Button onClick={importNew} disabled={busy || newCount === 0}>
                {busy ? "Working…" : `Import ${newCount} new`}
              </Button>
            </div>
          </div>

          {dupCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Words already in your list can’t be imported again — use{" "}
              <strong>Update</strong> instead. Only filled-in cells overwrite, so
              your existing tips are kept.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Status</TableHead>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                  <TableHead className="w-28 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const dup = dupFor(r);
                  return (
                    <TableRow key={i} className={dup ? "bg-muted/40" : undefined}>
                      <TableCell className="align-top">
                        {dup ? (
                          <Badge variant="secondary">In list</Badge>
                        ) : (
                          <Badge variant="outline">New</Badge>
                        )}
                      </TableCell>
                      {COLUMNS.map((c) => (
                        <TableCell key={c.key} className="align-top">
                          {c.key === "category" ? (
                            <Select
                              value={r.category || undefined}
                              onValueChange={(val) =>
                                editCell(i, "category", val)
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
                              value={(r[c.key] as string) ?? ""}
                              onChange={(e) => editCell(i, c.key, e.target.value)}
                            />
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="align-top text-right">
                        <div className="flex justify-end gap-1">
                          {dup && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateOne(i)}
                              disabled={busy}
                            >
                              Update
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeRow(i)}
                            disabled={busy}
                            aria-label="Remove row"
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
