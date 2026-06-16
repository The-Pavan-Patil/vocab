import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  HeadingLevel,
  AlignmentType,
} from "docx";
import { COLUMNS, type Vocab } from "./types";

function cell(text: string, opts: { bold?: boolean } = {}): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text: text || "", bold: opts.bold })],
      }),
    ],
  });
}

// Build a .docx Buffer containing a 5-column vocabulary table.
export async function buildDocx(rows: Vocab[]): Promise<Buffer> {
  const header = new TableRow({
    tableHeader: true,
    children: COLUMNS.map((c) => cell(c.label, { bold: true })),
  });

  const body = rows.map(
    (r) =>
      new TableRow({
        children: COLUMNS.map((c) => cell((r[c.key] as string) ?? "")),
      })
  );

  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...body],
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "Japanese Vocabulary" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `${rows.length} words`,
                italics: true,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          table,
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
