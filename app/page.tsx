"use client";

import { useCallback, useEffect, useState } from "react";
import { PencilLine, Layers, List, Upload, BookOpen } from "lucide-react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AddVocabForm from "@/components/AddVocabForm";
import Flashcards from "@/components/Flashcards";
import VocabTable from "@/components/VocabTable";
import ImportPanel from "@/components/ImportPanel";
import DictionarySearch from "@/components/DictionarySearch";
import { fetchVocab } from "@/lib/api";
import type { Vocab } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS = [
  { value: "add", label: "Add", short: "Add", icon: PencilLine },
  { value: "dictionary", label: "Dictionary", short: "Dict", icon: BookOpen },
  { value: "flashcards", label: "Flashcards", short: "Cards", icon: Layers },
  { value: "list", label: "List", short: "List", icon: List },
  { value: "import", label: "Import", short: "Import", icon: Upload },
];

export default function Home() {
  const [tab, setTab] = useState("add");
  const [vocab, setVocab] = useState<Vocab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    try {
      setVocab(await fetchVocab());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load. Kept separate from `reload` so we don't call setState
  // synchronously inside the effect body.
  useEffect(() => {
    let active = true;
    fetchVocab()
      .then((d) => active && setVocab(d))
      .catch((e) => active && setError((e as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <TabsPrimitive.Root
      value={tab}
      onValueChange={setTab}
      className="flex min-h-full flex-col"
    >
      {/* Navbar: brand · inline tab nav (desktop) · word count */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">
            <span className="jp">日本語</span>{" "}
            <span className="text-muted-foreground font-normal">Vocab</span>
          </h1>

          {/* Desktop / tablet: tabs live in the navbar itself. */}
          <TabsPrimitive.List className="mx-auto hidden items-center gap-1 sm:flex">
            {TABS.map((t) => (
              <TabsPrimitive.Trigger
                key={t.value}
                value={t.value}
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                <t.icon className="size-4 shrink-0" aria-hidden />
                {t.label}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>

          <p className="ml-auto text-sm whitespace-nowrap text-muted-foreground sm:ml-0">
            {loading ? "Loading…" : `${vocab.length} words`}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:px-6 sm:py-10">
        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Couldn’t load your vocabulary</AlertTitle>
            <AlertDescription>
              {error} — check your Supabase config in <code>.env.local</code> and
              that the <code>vocab</code> table exists.
            </AlertDescription>
          </Alert>
        )}

        <TabsContent value="add">
          <AddVocabForm onAdded={reload} />
        </TabsContent>
        <TabsContent value="dictionary">
          <DictionarySearch onAdded={reload} />
        </TabsContent>
        <TabsContent value="flashcards">
          <Flashcards vocab={vocab} />
        </TabsContent>
        <TabsContent value="list">
          <VocabTable vocab={vocab} onChanged={reload} />
        </TabsContent>
        {/* forceMount keeps the Import panel (and any in-progress upload /
            edits) alive when you switch tabs — e.g. to check a word in the
            Dictionary — instead of unmounting and losing the work. */}
        <TabsContent
          value="import"
          forceMount
          className="data-[state=inactive]:hidden"
        >
          <ImportPanel vocab={vocab} onImported={reload} />
        </TabsContent>
      </main>

      {/* Mobile: fixed bottom navigation in the thumb zone. */}
      <nav
        data-app-nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="grid grid-cols-5">
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <li key={t.value}>
                <button
                  type="button"
                  onClick={() => setTab(t.value)}
                  aria-current={active ? "page" : undefined}
                  className="flex w-full flex-col items-center gap-1 px-1 pt-2 pb-1.5 outline-none"
                >
                  <span
                    className={cn(
                      "flex items-center justify-center rounded-full px-5 py-1 transition-colors",
                      active ? "bg-primary/15 text-primary" : "text-muted-foreground"
                    )}
                  >
                    <t.icon className="size-6 shrink-0" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] leading-none font-medium",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {t.short}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </TabsPrimitive.Root>
  );
}
