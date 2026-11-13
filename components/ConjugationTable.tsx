"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { WordClass } from "@/lib/word-class";
import type {
  ConjugatedForm,
  ConjugationRow,
  ConjugationTable as Table,
} from "@/lib/conjugation";
import { Button } from "@/components/ui/button";

const CLASS_NAME: Record<WordClass, string> = {
  godan: "Godan verb (u-verb)",
  ichidan: "Ichidan verb (ru-verb)",
  suru: "する verb (irregular)",
  kuru: "来る verb (irregular)",
  "i-adj": "い-adjective",
  "na-adj": "な-adjective",
};

// The conjugator (kamiya-codec) loads on first open, not with the screen.
let conjugator: Promise<typeof import("@/lib/conjugation")> | null = null;
const loadConjugator = () => (conjugator ??= import("@/lib/conjugation"));

/**
 * A word's forms: plain and polite side by side, each with its romaji. The
 * everyday forms show; passive, causative and the conditionals sit behind
 * "More forms". Long forms wrap on a phone instead of scrolling sideways.
 */
export default function ConjugationTable({
  word,
  reading,
  cls,
  id,
}: {
  word: string;
  reading: string;
  cls: WordClass;
  id: string;
}) {
  const [table, setTable] = useState<Table | null>(null);
  const [failed, setFailed] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    let live = true;
    loadConjugator()
      .then(({ conjugationTable }) => {
        if (live) setTable(conjugationTable(word, reading, cls));
      })
      .catch(() => {
        conjugator = null;
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [word, reading, cls]);

  if (failed) {
    return (
      <p id={id} className="text-sm text-muted-foreground">
        Couldn’t load the conjugations. Check your connection and reopen.
      </p>
    );
  }
  if (!table) {
    return (
      <p id={id} className="text-sm text-muted-foreground">
        Loading conjugations…
      </p>
    );
  }

  const hasPolite = table.basic.some((row) => row.polite);
  return (
    <div id={id} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">
        Conjugations{" "}
        <span className="font-normal text-muted-foreground">
          · {CLASS_NAME[table.cls]}
        </span>
      </h3>
      <table className="w-full table-fixed text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="w-[30%] pb-1 font-normal sm:w-36">Form</th>
            <th scope="col" className="pb-1 font-normal">Plain</th>
            {hasPolite && (
              <th scope="col" className="pb-1 font-normal">Polite</th>
            )}
          </tr>
        </thead>
        <tbody>
          {table.basic.map((row) => (
            <Row key={row.label} row={row} hasPolite={hasPolite} />
          ))}
          {showMore &&
            table.more.map((row) => (
              <Row key={row.label} row={row} hasPolite={hasPolite} />
            ))}
        </tbody>
      </table>
      {table.more.length > 0 && (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMore((open) => !open)}
            aria-expanded={showMore}
          >
            <ChevronDown
              aria-hidden
              className={showMore ? "rotate-180 transition-transform" : "transition-transform"}
            />
            {showMore ? "Fewer forms" : "More forms"}
          </Button>
        </div>
      )}
    </div>
  );
}

// One form row: a real table row at every width (the forms are short enough
// to fit three columns on a phone; long ones wrap rather than scroll).
function Row({ row, hasPolite }: { row: ConjugationRow; hasPolite: boolean }) {
  return (
    <tr className="border-t border-border align-top">
      <th
        scope="row"
        className="py-1.5 pr-2 text-left text-xs font-normal text-muted-foreground sm:pr-3 sm:text-sm"
      >
        {row.label}
      </th>
      <td className="py-1.5 pr-2 break-words sm:pr-3">
        <Form form={row.plain} />
      </td>
      {hasPolite && (
        <td className="py-1.5 break-words">
          {row.polite ? <Form form={row.polite} /> : null}
        </td>
      )}
    </tr>
  );
}

function Form({ form }: { form: ConjugatedForm }) {
  return (
    <span className="block">
      <span lang="ja" translate="no" className="jp block text-base">
        {form.text}
      </span>
      <span className="block text-xs text-muted-foreground">{form.romaji}</span>
    </span>
  );
}
