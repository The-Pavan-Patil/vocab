// @pdf-lib/fontkit's UMD bundle references regeneratorRuntime (used by Devanagari
// complex-script shaping) without bundling it — this polyfill defines the global.
import "regenerator-runtime/runtime.js";
import { promises as fs } from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { COLUMNS, type Vocab } from "./types";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const JP_FONT = "NotoSansJP-Regular.ttf";
const DEV_FONT = "NotoSansDevanagari-Regular.ttf";

// Column layout weights (used to distribute available width).
const WEIGHTS: Record<string, number> = {
  kanji: 1.2,
  romaji: 1.4,
  english: 2.4,
  tips: 2.4,
  category: 1.0,
};

const PAGE_W = 842; // A4 landscape
const PAGE_H = 595;
const MARGIN = 40;
const FONT_SIZE = 10;
const HEADER_SIZE = 11;
const LINE_H = 13;
const CELL_PAD = 4;

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  for (const para of (text || "").split(/\n/)) {
    let line = "";
    for (const ch of para) {
      const test = line + ch;
      if (line && font.widthOfTextAtSize(test, size) > maxWidth) {
        const lastSpace = line.lastIndexOf(" ");
        if (lastSpace > 0) {
          lines.push(line.slice(0, lastSpace));
          line = line.slice(lastSpace + 1) + ch;
        } else {
          lines.push(line);
          line = ch;
        }
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function buildPdf(rows: Vocab[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const [jpBytes, devBytes] = await Promise.all([
    fs.readFile(path.join(FONT_DIR, JP_FONT)),
    fs.readFile(path.join(FONT_DIR, DEV_FONT)),
  ]);
  const jpFont = await pdfDoc.embedFont(jpBytes, { subset: true });
  const devFont = await pdfDoc.embedFont(devBytes, { subset: true });

  // The Tips column is Marathi (Devanagari); everything else uses the JP font
  // (which also covers Latin for romaji/english/category).
  const fontFor = (key: string): PDFFont => (key === "tips" ? devFont : jpFont);

  const contentW = PAGE_W - 2 * MARGIN;
  const weightSum = COLUMNS.reduce((s, c) => s + WEIGHTS[c.key], 0);
  const colWidths = COLUMNS.map((c) => (WEIGHTS[c.key] / weightSum) * contentW);
  const colX: number[] = [];
  let acc = MARGIN;
  for (const w of colWidths) {
    colX.push(acc);
    acc += w;
  }

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawTitle = () => {
    page.drawText("Japanese Vocabulary", {
      x: MARGIN,
      y: y - 16,
      size: 18,
      font: jpFont,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 30;
    page.drawText(`${rows.length} words`, {
      x: MARGIN,
      y: y - 10,
      size: 10,
      font: jpFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    y -= 24;
  };

  const drawHeaderRow = () => {
    const rowH = LINE_H + 2 * CELL_PAD;
    page.drawRectangle({
      x: MARGIN,
      y: y - rowH,
      width: contentW,
      height: rowH,
      color: rgb(0.15, 0.18, 0.28),
    });
    COLUMNS.forEach((c, i) => {
      page.drawText(c.label, {
        x: colX[i] + CELL_PAD,
        y: y - CELL_PAD - HEADER_SIZE,
        size: HEADER_SIZE,
        font: jpFont,
        color: rgb(1, 1, 1),
      });
    });
    y -= rowH;
  };

  drawTitle();
  drawHeaderRow();

  let zebra = false;
  for (const row of rows) {
    // Compute wrapped lines per cell and the resulting row height.
    const cells = COLUMNS.map((c, i) => {
      const font = fontFor(c.key);
      const text = ((row[c.key] as string) ?? "").toString();
      const lines = wrapText(text, font, FONT_SIZE, colWidths[i] - 2 * CELL_PAD);
      return { font, lines };
    });
    const maxLines = Math.max(...cells.map((c) => c.lines.length));
    const rowH = maxLines * LINE_H + 2 * CELL_PAD;

    // Page break if this row doesn't fit.
    if (y - rowH < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
      drawHeaderRow();
    }

    if (zebra) {
      page.drawRectangle({
        x: MARGIN,
        y: y - rowH,
        width: contentW,
        height: rowH,
        color: rgb(0.95, 0.96, 0.98),
      });
    }
    zebra = !zebra;

    cells.forEach((cell, i) => {
      cell.lines.forEach((line, li) => {
        page.drawText(line, {
          x: colX[i] + CELL_PAD,
          y: y - CELL_PAD - FONT_SIZE - li * LINE_H,
          size: FONT_SIZE,
          font: cell.font,
          color: rgb(0.1, 0.1, 0.1),
        });
      });
    });
    y -= rowH;
  }

  return Buffer.from(await pdfDoc.save());
}
