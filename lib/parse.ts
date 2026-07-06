import Papa from "papaparse";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import type { VocabInput } from "./types";

// The text columns an import file can carry. `study_as_kanji` (a UI toggle) and
// `kanji_selection` (chosen in the Add-word breakdown) are not importable cells,
// so they're excluded from header detection / positional mapping.
type ImportField = Exclude<keyof VocabInput, "study_as_kanji" | "kanji_selection">;

// Map flexible header names (any language/casing) onto our canonical fields.
const HEADER_SYNONYMS: Record<ImportField, string[]> = {
  kanji: ["kanji", "japanese", "word", "漢字", "kana", "hiragana"],
  romaji: ["romaji", "reading", "pronunciation", "roumaji", "romanji"],
  english: ["english", "meaning", "english meaning", "definition", "translation"],
  tips: ["tips", "tip", "marathi", "hint", "note", "notes", "mnemonic"],
  category: ["category", "type", "pos", "part of speech", "class"],
};

const FIELD_ORDER: ImportField[] = [
  "kanji",
  "romaji",
  "english",
  "tips",
  "category",
];

// Priority for *header* detection. `tips` is checked before `english` so a label
// like "Marathi meaning / my tips" claims the tips column via "marathi"/"tips"
// instead of being grabbed by english's broad "meaning" synonym (which would
// otherwise overwrite the real English column with the blank tips cell).
const HEADER_MATCH_ORDER: ImportField[] = [
  "kanji",
  "romaji",
  "tips",
  "english",
  "category",
];

function normalize(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

// Given a list of header cells, produce an index→field mapping.
// Returns null if no header cell matches any known synonym (positional fallback).
function mapHeaders(headers: string[]): (ImportField | null)[] | null {
  let matched = false;
  const mapping = headers.map((h) => {
    const n = normalize(h);
    for (const field of HEADER_MATCH_ORDER) {
      // Substring match so labels like "Tips (Marathi)" or "English Meaning" still map.
      if (HEADER_SYNONYMS[field].some((syn) => n === syn || n.includes(syn))) {
        matched = true;
        return field;
      }
    }
    return null;
  });
  return matched ? mapping : null;
}

// Build a VocabInput from a row of cells using a header mapping (or positional).
function rowToVocab(
  cells: string[],
  mapping: (ImportField | null)[] | null
): VocabInput | null {
  const out: Record<string, string | null> = {};
  if (mapping) {
    mapping.forEach((field, i) => {
      if (field) out[field] = (cells[i] ?? "").trim() || null;
    });
  } else {
    FIELD_ORDER.forEach((field, i) => {
      out[field] = (cells[i] ?? "").trim() || null;
    });
  }
  const kanji = out.kanji;
  if (!kanji) return null; // kanji is required; skip empty/blank rows
  return {
    kanji,
    romaji: out.romaji ?? null,
    english: out.english ?? null,
    tips: out.tips ?? null,
    category: out.category ?? null,
  };
}

// Convert a matrix of rows (first row may be a header) into VocabInput[].
function matrixToVocab(rows: string[][]): VocabInput[] {
  const cleaned = rows.filter((r) => r.some((c) => normalize(c) !== ""));
  if (cleaned.length === 0) return [];
  const mapping = mapHeaders(cleaned[0]);
  const dataRows = mapping ? cleaned.slice(1) : cleaned;
  return dataRows
    .map((r) => rowToVocab(r, mapping))
    .filter((v): v is VocabInput => v !== null);
}

function parseCsv(text: string): VocabInput[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  return matrixToVocab(result.data as string[][]);
}

function parseExcel(buffer: Buffer): VocabInput[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });
  return matrixToVocab(rows.map((r) => r.map((c) => String(c ?? ""))));
}

function cleanCell(cell: string): string {
  return cell
    .replace(/<[^>]+>/g, " ") // strip tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlTableToRows(table: string): string[][] {
  const rowMatches = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  return rowMatches.map((tr) => {
    const cellMatches = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [];
    return cellMatches.map(cleanCell);
  });
}

async function parseDocx(buffer: Buffer): Promise<VocabInput[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  // Many documents split vocab across several sections (e.g. Nouns / Verbs /
  // Adjectives), each rendered as its own table with its own header row.
  // Parse EVERY table independently and concatenate, so all sections import —
  // not just the first one.
  const tableMatches = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  return tableMatches.flatMap((table) =>
    matrixToVocab(htmlTableToRows(table))
  );
}

async function parsePdf(buffer: Buffer): Promise<VocabInput[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    // Prefer real table detection (analyses the PDF's drawn grid lines).
    const tableResult = await parser.getTable();
    const tableRows: string[][] = (tableResult.mergedTables ?? []).flat();
    if (tableRows.length) {
      const fromTable = matrixToVocab(tableRows);
      if (fromTable.length) return fromTable;
    }
    // Fallback: split plain text lines on runs of 2+ spaces / tabs into columns.
    const textResult = await parser.getText();
    const rows = textResult.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => l.split(/\t+|\s{2,}/).map((c) => c.trim()));
    return matrixToVocab(rows);
  } finally {
    await parser.destroy();
  }
}

export async function parseFile(
  buffer: Buffer,
  filename: string
): Promise<VocabInput[]> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "csv":
    case "txt":
      return parseCsv(buffer.toString("utf-8"));
    case "xlsx":
    case "xls":
      return parseExcel(buffer);
    case "docx":
      return parseDocx(buffer);
    case "pdf":
      return parsePdf(buffer);
    default:
      throw new Error(
        `Unsupported file type ".${ext}". Use CSV, XLSX/XLS, DOCX, or PDF.`
      );
  }
}
