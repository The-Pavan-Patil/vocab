"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, Trash2 } from "lucide-react";
import { createVocab, importFile } from "@/lib/api";
import { CATEGORIES, COLUMNS, type VocabInput } from "@/lib/types";
import { Button } from "@/components/ui/button";
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

export default function ImportPanel({ onImported }: { onImported: () => void }) {
  const [rows, setRows] = useState<VocabInput[] | null>(null);
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setRows((rs) => (rs ? rs.filter((_, idx) => idx !== i) : rs));
  }

  async function confirmImport() {
    if (!rows || rows.length === 0) return;
    setSaving(true);
    try {
      const valid = rows.filter((r) => r.kanji?.trim());
      const n = await createVocab(valid);
      toast.success(`Imported ${n} word${n === 1 ? "" : "s"}`);
      setRows(null);
      setFilename("");
      if (fileRef.current) fileRef.current.value = "";
      onImported();
    } catch (e) {
      toast.error("Import failed", { description: (e as Error).message });
    } finally {
      setSaving(false);
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
                Edit any cell before importing.
              </p>
            </div>
            <Button onClick={confirmImport} disabled={saving}>
              {saving ? "Importing…" : `Confirm import (${rows.length})`}
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
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
                    <TableCell className="align-top">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeRow(i)}
                        aria-label="Remove row"
                      >
                        <Trash2 aria-hidden />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
