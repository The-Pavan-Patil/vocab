"use client";

import {
  memo,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Download, Languages, Pencil, Search, Trash2 } from "lucide-react";
import { deleteVocab, exportList } from "@/lib/api";
import { toastError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { setSearchParams, useSearchParam } from "@/hooks/use-search-param";
import {
  CATEGORIES,
  COLUMNS,
  type Vocab,
  type VocabLoadState,
} from "@/lib/types";
import EditVocabDialog from "@/components/EditVocabDialog";
import ScreenHeader from "@/components/ScreenHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

// Thousands grouping in the reader's locale.
const WORDS = new Intl.NumberFormat();

const EXPORT_FILENAME = {
  docx: "japanese-vocab.docx",
  pdf: "japanese-vocab.pdf",
} as const;

export default function VocabTable({
  vocab,
  loadState = "ready",
  onChanged,
  revealWord,
}: {
  vocab: Vocab[];
  loadState?: VocabLoadState;
  onChanged: () => void;
  revealWord?: { word: string; requestId: number } | null;
}) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  // Search and filter are mirrored into the URL (?search=…&category=…) so a
  // reload or a shared link shows the same slice of the list. The URL is read
  // once, after hydration; from then on local state leads and the URL follows.
  const urlSearch = useSearchParam("search");
  const urlCategory = useSearchParam("category");
  const [adoptedUrl, setAdoptedUrl] = useState(false);
  if (!adoptedUrl && (urlSearch !== null || urlCategory !== null)) {
    setAdoptedUrl(true);
    if (urlSearch !== null) setQuery(urlSearch);
    if (urlCategory !== null && CATEGORIES.includes(urlCategory as never)) {
      setCat(urlCategory);
    }
  }
  const urlWriteRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function syncUrl(nextQuery: string, nextCat: string) {
    setAdoptedUrl(true);
    if (urlWriteRef.current) clearTimeout(urlWriteRef.current);
    // Debounced: one history write when typing pauses, not one per keystroke.
    urlWriteRef.current = setTimeout(() => {
      setSearchParams({
        search: nextQuery.trim() || null,
        category: nextCat === "all" ? null : nextCat,
      });
    }, 300);
  }
  const [editing, setEditing] = useState<Vocab | null>(null);
  const [busy, setBusy] = useState(false);
  // The word waiting on the delete confirmation (null = dialog closed).
  const [pendingDelete, setPendingDelete] = useState<Vocab | null>(null);
  // Where focus goes once a confirmed delete closes the dialog: the delete
  // button of the neighbouring row, since the confirmed row is about to go —
  // or the search box when it was the only row showing.
  const focusAfterDeleteRef = useRef<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [handledRevealId, setHandledRevealId] = useState<number | null>(null);
  const [exporting, setExporting] = useState<"docx" | "pdf" | null>(null);

  const showingReveal =
    revealWord !== null &&
    revealWord !== undefined &&
    revealWord.requestId !== handledRevealId;
  const activeQuery = showingReveal ? revealWord.word : query;
  const activeCat = showingReveal ? "all" : cat;
  // Filtering a long list on every keystroke would make typing lag; the input
  // stays on `activeQuery` and the table catches up with the deferred copy.
  const filterQuery = useDeferredValue(activeQuery);

  const filtered = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return vocab.filter((v) => {
      if (activeCat !== "all" && v.category !== activeCat) return false;
      if (!q) return true;
      return [v.kanji, v.romaji, v.english, v.tips, v.sentence, v.category]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q));
    });
  }, [vocab, filterQuery, activeCat]);

  const filtering = activeQuery.trim() !== "" || activeCat !== "all";
  const inKanjiDeck = vocab.filter((v) => v.study_as_kanji).length;

  // The count is spoken once typing settles, not after every keystroke.
  const summary = `Showing ${filtered.length} of ${vocab.length} words`;
  const [spokenSummary, setSpokenSummary] = useState(summary);
  useEffect(() => {
    const timer = setTimeout(() => setSpokenSummary(summary), 600);
    return () => clearTimeout(timer);
  }, [summary]);

  function finishReveal() {
    if (revealWord) setHandledRevealId(revealWord.requestId);
  }

  async function downloadList(format: "docx" | "pdf") {
    if (exporting) return;
    setExporting(format);
    try {
      const url = URL.createObjectURL(await exportList(format));
      const link = document.createElement("a");
      link.href = url;
      link.download = EXPORT_FILENAME[format];
      document.body.append(link);
      link.click();
      link.remove();
      // Give the browser a moment to start the download before freeing it.
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toastError("Couldn’t export your list", e, {
        retry: () => void downloadList(format),
      });
    } finally {
      setExporting(null);
    }
  }

  async function doDelete(id: string) {
    setBusy(true);
    try {
      await deleteVocab(id);
      onChanged();
      toast.success("Word deleted");
    } catch (e) {
      toastError("Couldn’t delete the word", e, { retry: () => void doDelete(id) });
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!pendingDelete) return;
    const index = filtered.findIndex((v) => v.id === pendingDelete.id);
    const neighbour = filtered[index + 1] ?? filtered[index - 1];
    focusAfterDeleteRef.current = neighbour?.id ?? "search";
    void doDelete(pendingDelete.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenHeader
        title="Your words"
        actions={
          <>
            {(["docx", "pdf"] as const).map((format) => (
              <Button
                key={format}
                variant="outline"
                onClick={() => void downloadList(format)}
                aria-disabled={exporting !== null || undefined}
                className="aria-disabled:opacity-50"
              >
                {exporting === format ? (
                  <Spinner data-icon="inline-start" aria-hidden />
                ) : (
                  <Download aria-hidden />
                )}
                {exporting === format
                  ? "Exporting…"
                  : format === "docx"
                    ? "Export .docx"
                    : "Export PDF"}
              </Button>
            ))}
          </>
        }
      >
        {loadState === "ready" &&
          `${WORDS.format(vocab.length)} ${vocab.length === 1 ? "word" : "words"} · ${WORDS.format(inKanjiDeck)} in the Kanji deck`}
      </ScreenHeader>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <InputGroup className="min-w-[180px] flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            type="search"
            name="q"
            aria-label="Search your words"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search words…"
            value={activeQuery}
            onChange={(event) => {
              setQuery(event.target.value);
              setCat(activeCat);
              finishReveal();
              syncUrl(event.target.value, activeCat);
            }}
          />
        </InputGroup>

        <Select
          value={activeCat}
          onValueChange={(category) => {
            setQuery(activeQuery);
            setCat(category);
            finishReveal();
            syncUrl(activeQuery, category);
          }}
        >
          <SelectTrigger className="w-40" aria-label="Filter by category">
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

      </div>

      {loadState === "ready" && (
        <>
          {/* Unfiltered, the title row already gives the count. */}
          {filtering && (
            <p className="text-sm text-muted-foreground tabular-nums">
              {summary}
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            {spokenSummary}
          </p>
        </>
      )}

      {loadState === "loading" ? (
        // Placeholder rows while the list loads, rather than a false "No
        // words found".
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only">Loading your words…</span>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : loadState === "failed" ? null : filtered.length === 0 ? (
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
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((c, i) => (
                  <TableHead
                    key={c.key}
                    // The word stays in view while a phone scrolls the
                    // table sideways.
                    className={i === 0 ? STICKY_FIRST : undefined}
                  >
                    {c.label}
                  </TableHead>
                ))}
                <TableHead className={cn("w-24 text-right", STICKY_LAST)}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((v) => (
                <VocabRow
                  key={v.id}
                  word={v}
                  busy={busy}
                  onEdit={setEditing}
                  onDelete={setPendingDelete}
                />
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

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            const id = focusAfterDeleteRef.current;
            focusAfterDeleteRef.current = null;
            const next =
              id === "search"
                ? searchRef.current
                : id
                  ? document.querySelector<HTMLElement>(`[data-delete-id="${id}"]`)
                  : null;
            if (next) {
              event.preventDefault();
              next.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete <span lang="ja" translate="no" className="jp">{pendingDelete?.kanji}</span>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the word and its review history from every deck. It
              can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep word</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete word
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Pins the word column below sm, where the table scrolls inside its frame,
// and the actions at every width, so Edit and Delete never scroll out of
// reach beside the sidebar.
const STICKY_FIRST = "max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-card";
const STICKY_LAST = "sticky right-0 z-10 bg-card";

// An empty field: a grey dash, read as "none".
function Missing() {
  return (
    <>
      <span aria-hidden className="text-muted-foreground">
        —
      </span>
      <span className="sr-only" lang="en">
        none
      </span>
    </>
  );
}

// One word's row. Memoized (the parent's callbacks are state setters, so they
// never change) — a new search or filter re-renders only rows whose word or
// busy state changed, not the whole list.
const VocabRow = memo(function VocabRow({
  word: v,
  busy,
  onEdit,
  onDelete,
}: {
  word: Vocab;
  busy: boolean;
  onEdit: (word: Vocab) => void;
  onDelete: (word: Vocab) => void;
}) {
  return (
    // No hover fill: the pinned cells are opaque, and a fill would stop at them.
    <TableRow className="hover:bg-transparent">
      <TableCell className={cn("text-base font-medium", STICKY_FIRST)}>
        <span lang="ja" translate="no" className="jp">
          {v.kanji}
        </span>
        {/* Kanji-deck membership rides on the word (the column it used to
            have was empty on most rows). Same icon as the Kanji tab. */}
        {v.study_as_kanji && (
          <span title="In the Kanji deck">
            <Languages
              className="ml-1.5 inline-block size-3.5 align-[-0.1em] text-muted-foreground"
              role="img"
              aria-label="In the Kanji deck"
            />
          </span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {v.romaji || <Missing />}
      </TableCell>
      {/* Free text: wrap within a sensible width instead of stretching the
          table sideways (TableCell is nowrap by default). */}
      <TableCell className="max-w-xs min-w-40 whitespace-normal break-words">
        {v.english || <Missing />}
      </TableCell>
      <TableCell lang="mr" className="max-w-xs min-w-32 whitespace-normal break-words">
        {v.tips || <Missing />}
      </TableCell>
      <TableCell
        lang="ja"
        translate="no"
        className="jp max-w-xs min-w-40 whitespace-normal break-words"
      >
        {v.sentence || <Missing />}
      </TableCell>
      <TableCell>
        {v.category ? <Badge variant="secondary">{v.category}</Badge> : <Missing />}
      </TableCell>
      <TableCell className={cn("text-right", STICKY_LAST)}>
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(v)}
            aria-label={`Edit ${v.kanji}`}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive aria-disabled:opacity-50"
            // aria-disabled, not disabled: after a confirmed delete focus moves
            // to the next row's button while the request is still running, and
            // a disabled button can't take focus.
            onClick={() => {
              if (!busy) onDelete(v);
            }}
            aria-disabled={busy || undefined}
            aria-label={`Delete ${v.kanji}`}
            data-delete-id={v.id}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
