"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { createVocab, importFile, updateVocab } from "@/lib/api";
import { nonEmptyPatch } from "@/lib/import-patch";
import { toastError, toastKanjiSyncWarning } from "@/lib/notify";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import ConfirmDialog from "@/components/ConfirmDialog";
import ScreenHeader from "@/components/ScreenHeader";
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
import { Spinner } from "@/components/ui/spinner";


// The example row under the drop box (one of the words a learner starts with).
const SAMPLE_ROW: Partial<Record<keyof VocabInput, string>> = {
  kanji: "食べる",
  romaji: "taberu",
  english: "to eat",
  tips: "खाणे",
  sentence: "毎朝ご飯を食べる。",
  category: "verb",
};
const SAMPLE_LANG: Partial<Record<keyof VocabInput, string>> = {
  kanji: "ja",
  tips: "mr",
  sentence: "ja",
};

export default function ImportPanel({
  vocab,
  onImported,
}: {
  vocab: Vocab[];
  // The rows the server saved (new words or updated duplicates), for the page
  // to patch into its list.
  onImported: (saved: Vocab[]) => void;
}) {
  const [rows, setRows] = useState<VocabInput[] | null>(null);
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  // Which bulk action is running, so only its button says so.
  const [working, setWorking] = useState<"import" | "update" | null>(null);
  // "Update N existing" overwrites saved words, so it asks first.
  const [confirmUpdateAll, setConfirmUpdateAll] = useState(false);
  // A new file replaces the preview, edits and all — so with rows on screen,
  // choosing or dropping one asks first. `file` is set for a drop (already in
  // hand); a "Choose file" click opens the picker once confirmed.
  const [pendingReplace, setPendingReplace] = useState<{ file?: File } | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  // An unimported (possibly edited) preview is lost on reload — ask first.
  useBeforeUnload(!!rows?.length);
  const [studyAllAsKanji, setStudyAllAsKanji] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement>(null);
  // Where focus goes after an action removes rows (the pressed button may go
  // with them): a row index, or the preview heading after a bulk action.
  const focusAfterRef = useRef<number | "heading" | null>(null);

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
  // Rows with no word can't be imported until one is typed in.
  const missingCount = allRows.length - newCount - dupCount;

  async function readFile(file: File) {
    setParsing(true);
    setFilename(file.name);
    try {
      const parsed = await importFile(file);
      // A file that reads as nothing leaves the current preview alone.
      if (parsed.length === 0) {
        toast.error("Nothing to import", {
          description:
            "No rows could be read. Make sure the file has a header row with a Kanji column, then choose it again.",
        });
        return;
      }
      setRows(parsed);
    } catch (e) {
      toastError("Couldn’t read that file", e, {
        nextStep:
          "Check it’s a CSV, Excel, Word or PDF file that isn’t password-protected, then choose it again.",
      });
    } finally {
      setParsing(false);
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    // Clear the input so picking the same file again (after fixing it, or after
    // removing every preview row) still fires `change`.
    input.value = "";
    if (file) void readFile(file);
  }

  function chooseFile() {
    if (parsing) return;
    if (rows?.length) setPendingReplace({});
    else fileRef.current?.click();
  }

  // Dropping a file on the box reads it like "Choose file" — without this the
  // browser would open the file in place of the app and lose every tab's work.
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || parsing) return;
    if (rows?.length) setPendingReplace({ file });
    else void readFile(file);
  }

  // After rows go away, put focus back where the person was working if the
  // control they pressed went with them: the row now in that slot, else the
  // preview heading, else "Choose file" once the preview is gone.
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) return;
    focusAfterRef.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const rowEls = previewRef.current?.querySelectorAll("tbody tr") ?? [];
    const row =
      typeof target === "number" && rowEls.length
        ? rowEls[Math.min(target, rowEls.length - 1)]
        : null;
    const next =
      row?.querySelector<HTMLElement>("[data-row-action]") ??
      previewHeadingRef.current ??
      chooseRef.current;
    next?.focus();
  }, [rows]);

  // Row callbacks are stable (functional updates, no closure over `rows`), so
  // the memoized <ImportRow>s re-render only when their own row changes — a
  // keystroke in one cell doesn't re-render a few hundred rows of inputs.
  const editCell = useCallback(
    (i: number, key: keyof VocabInput, value: string) => {
      setRows((rs) =>
        rs ? rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)) : rs
      );
    },
    []
  );

  const removeRow = useCallback((i: number) => {
    focusAfterRef.current = i;
    setRows((rs) => {
      if (!rs) return rs;
      const next = rs.filter((_, idx) => idx !== i);
      return next.length ? next : null;
    });
  }, []);

  // Import only the NEW words; leave duplicates (to update) and rows still
  // missing a word (to fix) in the preview.
  async function importNew() {
    if (busy || newCount === 0) return;
    setBusy(true);
    setWorking("import");
    try {
      const { rows: saved, inserted: n, syncWarning } = await createVocab(
        newRows.map((r) => ({ ...r, study_as_kanji: studyAllAsKanji }))
      );
      toast.success(`Imported ${n} new word${n === 1 ? "" : "s"}`);
      if (syncWarning) {
        toastKanjiSyncWarning("Imported, but Kanji sync needs a retry", syncWarning);
      }
      focusAfterRef.current = "heading";
      setRows((rs) => {
        const remaining = (rs ?? []).filter(
          (r) => dupFor(r) || !(r.kanji ?? "").trim()
        );
        return remaining.length ? remaining : null;
      });
      onImported(saved);
    } catch (e) {
      toastError("Import failed", e, {
        nextStep: "The preview is unchanged — press Import to try again.",
      });
    } finally {
      setBusy(false);
      setWorking(null);
    }
  }

  // Update one existing word from its (edited) row, then drop it. Takes the row
  // and its match rather than reading `rows`, so it stays a stable callback.
  const updateOne = useCallback(
    async (r: VocabInput, dup: Vocab, index: number) => {
      setBusy(true);
      try {
        const { data, syncWarning } = await updateVocab(dup.id, nonEmptyPatch(r));
        toast.success("Updated", { description: r.kanji });
        if (syncWarning) {
          toastKanjiSyncWarning("Updated, but Kanji sync needs a retry", syncWarning);
        }
        focusAfterRef.current = index;
        // By identity, not index: a Retry can run after other rows were
        // removed. An edited row is a new object and stays put.
        setRows((rs) => {
          const next = rs?.filter((row) => row !== r) ?? null;
          return next && next.length ? next : null;
        });
        onImported([data]);
      } catch (e) {
        toastError("Update failed", e, {
          nextStep: "The row is still in the preview — press Update to try again.",
        });
      } finally {
        setBusy(false);
      }
    },
    [onImported]
  );

  // Update every duplicate at once.
  async function updateAll() {
    const targets = allRows.filter((r) => dupFor(r));
    if (busy || targets.length === 0) return;
    setBusy(true);
    setWorking("update");
    try {
      // Rows that match the same saved word are applied to it one after the
      // other (in preview order), so its last result is what the database
      // holds; different words update in parallel.
      const byWord = new Map<string, VocabInput[]>();
      for (const r of targets) {
        const id = dupFor(r)!.id;
        byWord.set(id, [...(byWord.get(id) ?? []), r]);
      }
      const results = (
        await Promise.all(
          [...byWord].map(async ([id, rows]) => {
            const saved = [];
            for (const r of rows) saved.push(await updateVocab(id, nonEmptyPatch(r)));
            return saved;
          })
        )
      ).flat();
      toast.success(
        `Updated ${targets.length} existing word${targets.length === 1 ? "" : "s"}`
      );
      const syncWarning = results.find((result) => result.syncWarning)?.syncWarning;
      if (syncWarning) {
        toastKanjiSyncWarning("Updated, but Kanji sync needs a retry", syncWarning);
      }
      focusAfterRef.current = "heading";
      setRows((rs) => {
        const remaining = (rs ?? []).filter((r) => !dupFor(r));
        return remaining.length ? remaining : null;
      });
      onImported(results.map((result) => result.data));
    } catch (e) {
      toastError("Update failed", e, {
        nextStep: "The preview is unchanged — press Update to try again.",
      });
    } finally {
      setBusy(false);
      setWorking(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Import">
        Rows are matched to your list by their kanji, so nothing is added
        twice.
      </ScreenHeader>

      {/* Opened by the "Choose file" button; display:none keeps it out of the
          tab order and the accessibility tree (click() still works). */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls,.docx,.pdf"
        onChange={onPick}
        className="hidden"
      />

      <p className="sr-only" aria-live="polite">
        {parsing
          ? `Reading ${filename}…`
          : rows && rows.length > 0
            ? `${rows.length} rows ready to review: ${newCount} new, ${dupCount} already in your list${missingCount > 0 ? `, ${missingCount} missing a word` : ""}.`
            : ""}
      </p>

      <Empty
        className="rounded-xl border border-dashed border-input transition-colors data-[drag=true]:border-primary data-[drag=true]:bg-primary/5"
        data-drag={dragging || undefined}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={onDrop}
      >
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {parsing ? <Loader2 className="animate-spin" /> : <FileUp />}
          </EmptyMedia>
          <EmptyTitle className="max-w-full break-all">
            {parsing ? `Reading ${filename}…` : "Drop a word list here"}
          </EmptyTitle>
          <EmptyDescription>
            Or choose one: CSV or text (
            <span translate="no">.csv/.txt</span>), Excel (
            <span translate="no">.xlsx/.xls</span>), Word (
            <span translate="no">.docx</span>) or PDF. Every section or table
            in the file is read.
          </EmptyDescription>
        </EmptyHeader>
        <Button
          ref={chooseRef}
          onClick={chooseFile}
          aria-disabled={parsing || undefined}
          className="mt-2 aria-disabled:opacity-50"
        >
          <FileUp aria-hidden />
          Choose file
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          CSV and Excel parse most reliably. PDF tables are best-effort — review
          the preview before importing.
        </p>
      </Empty>

      {/* Before a file is chosen: the shape the parser expects, as one real
          row — easier to match than a list of column names. */}
      {!rows?.length && !parsing && (
        <figure className="flex flex-col gap-2">
          <figcaption className="text-sm text-muted-foreground">
            A header row, then one word per row. Only the Kanji column is
            required.
          </figcaption>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {COLUMNS.map((c) => (
                    // Matched literally by lib/parse.ts — keep auto-translate off.
                    <TableHead key={c.key} translate="no">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  {COLUMNS.map((c) => (
                    <TableCell
                      key={c.key}
                      lang={SAMPLE_LANG[c.key]}
                      className={SAMPLE_LANG[c.key] === "ja" ? "jp" : undefined}
                    >
                      {SAMPLE_ROW[c.key]}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </figure>
      )}

      {rows && rows.length > 0 && (
        <div ref={previewRef} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                ref={previewHeadingRef}
                tabIndex={-1}
                className="font-semibold outline-none"
              >
                Preview — {rows.length} row{rows.length === 1 ? "" : "s"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {newCount} new · {dupCount} already in your list
                {missingCount > 0 && <> · {missingCount} missing a word</>}.
                Edit any cell first.
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
              {/* aria-disabled, not disabled, on these: the pressed button
                  keeps focus while it works. */}
              {dupCount > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!busy) setConfirmUpdateAll(true);
                  }}
                  aria-disabled={busy || undefined}
                  className="aria-disabled:opacity-50"
                >
                  {working === "update" ? (
                    <Spinner data-icon="inline-start" aria-hidden />
                  ) : (
                    <RefreshCw aria-hidden />
                  )}
                  {working === "update"
                    ? "Updating…"
                    : `Update ${dupCount} existing`}
                </Button>
              )}
              <Button
                onClick={importNew}
                aria-disabled={busy || newCount === 0 || undefined}
                className="aria-disabled:opacity-50"
              >
                {working === "import" && (
                  <Spinner data-icon="inline-start" aria-hidden />
                )}
                {working === "import" ? "Importing…" : `Import ${newCount} new`}
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
                {rows.map((r, i) => (
                  <ImportRow
                    key={i}
                    row={r}
                    index={i}
                    dup={dupFor(r)}
                    busy={busy}
                    onEdit={editCell}
                    onRemove={removeRow}
                    onUpdate={updateOne}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingReplace !== null}
        title="Replace the current preview?"
        description={`The ${allRows.length} ${allRows.length === 1 ? "row" : "rows"} you haven’t imported yet, and any edits to them, will be replaced by the new file.`}
        confirmLabel="Replace preview"
        cancelLabel="Keep reviewing"
        destructive
        onConfirm={() => {
          const file = pendingReplace?.file;
          setPendingReplace(null);
          // Still inside the confirm click, so the picker is allowed to open.
          if (file) void readFile(file);
          else fileRef.current?.click();
        }}
        onCancel={() => setPendingReplace(null)}
      />

      <ConfirmDialog
        open={confirmUpdateAll}
        title={`Update ${dupCount} ${dupCount === 1 ? "word" : "words"} in your list?`}
        description="Filled-in cells replace what’s saved for these words. Empty cells leave the saved value as it is. This can’t be undone."
        confirmLabel={`Update ${dupCount} ${dupCount === 1 ? "word" : "words"}`}
        cancelLabel="Keep reviewing"
        onConfirm={() => {
          setConfirmUpdateAll(false);
          void updateAll();
        }}
        onCancel={() => setConfirmUpdateAll(false)}
      />
    </div>
  );
}

// One preview row. Memoized: the parent passes stable callbacks, so only the
// row being edited (or removed / re-matched) re-renders.
const ImportRow = memo(function ImportRow({
  row: r,
  index,
  dup,
  busy,
  onEdit,
  onRemove,
  onUpdate,
}: {
  row: VocabInput;
  index: number;
  dup: Vocab | undefined;
  busy: boolean;
  onEdit: (i: number, key: keyof VocabInput, value: string) => void;
  onRemove: (i: number) => void;
  onUpdate: (r: VocabInput, dup: Vocab, index: number) => void;
}) {
  // No word yet: "Import N new" skips the row, so say so rather than "New".
  const missingWord = !(r.kanji ?? "").trim();
  return (
    <TableRow className={dup ? "bg-muted/40" : undefined}>
      <TableCell className="align-top">
        {dup ? (
          <Badge variant="secondary">In list</Badge>
        ) : missingWord ? (
          <Badge variant="destructive">Needs a word</Badge>
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
                onEdit(index, "category", val)
              }
            >
              <SelectTrigger
                size="sm"
                className="w-full"
                aria-label={`${c.label}, row ${index + 1}`}
              >
                <SelectValue placeholder="Category" />
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
              className={
                c.key === "kanji" || c.key === "sentence"
                  ? "jp"
                  : undefined
              }
              aria-label={`${c.label}, row ${index + 1}`}
              lang={
                c.key === "kanji" || c.key === "sentence"
                  ? "ja"
                  : c.key === "tips"
                    ? "mr"
                    : undefined
              }
              name={`${c.key}-${index}`}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={(c.key === "kanji" && missingWord) || undefined}
              value={(r[c.key] as string) ?? ""}
              onChange={(e) => onEdit(index, c.key, e.target.value)}
            />
          )}
        </TableCell>
      ))}
      <TableCell className="align-top text-right">
        <div className="flex justify-end gap-1">
          {/* aria-disabled + a guard rather than disabled, so a busy row
              doesn't throw keyboard focus out to <body>. */}
          {dup && (
            <Button
              size="sm"
              variant="outline"
              className="aria-disabled:opacity-50"
              onClick={() => {
                if (!busy) onUpdate(r, dup, index);
              }}
              aria-disabled={busy || undefined}
              aria-label={`Update ${r.kanji || `row ${index + 1}`} in your list`}
              data-row-action
            >
              Update
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive aria-disabled:opacity-50"
            onClick={() => {
              if (!busy) onRemove(index);
            }}
            aria-disabled={busy || undefined}
            aria-label={`Remove ${r.kanji || `row ${index + 1}`} from the import`}
            data-row-action
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
