# 日本語 Vocab — Japanese Study App

A personal Next.js app for studying Japanese vocabulary. Each word has 5 attributes:
**Kanji, Romaji, English meaning, Tips (Marathi), Category** (noun/verb/adjective/…).

## Features
- **Add Vocab** — form to add words.
- **Flashcards** — front shows Kanji + Romaji; flip / **Show** reveals the English meaning;
  **Hint** reveals the Marathi tip. Shuffle + category filter + prev/next.
- **Vocab List** — searchable table of all columns with inline edit & delete.
- **Export** — download the whole list as **.docx** or **PDF** (kanji + Marathi render correctly
  via embedded Noto fonts).
- **Import** — upload **CSV / Excel (.xlsx, .xls) / Word (.docx) / PDF** with a 5-column table;
  review/edit the parsed preview, then confirm to bulk-insert.

## Tech
Next.js (App Router, TS) · Tailwind CSS v4 · Supabase (Postgres) · `docx`, `pdf-lib` (export) ·
`papaparse`, `xlsx`, `mammoth`, `pdf-parse` (import).

## Setup

### 1. Create the Supabase project
1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](./supabase/schema.sql),
   and run it to create the `vocab` table.
3. Go to **Project Settings → API** and copy the **Project URL** and the **service-role** key.

### 2. Configure environment
```bash
cp .env.local.example .env.local
```
Fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```
The service-role key is used only by server-side API routes and is never sent to the browser.

### 3. Run
```bash
npm install
npm run dev
```
Open <http://localhost:3000>.

## Import file format
The first row may be a header. Recognized column names (case-insensitive, any order):
`kanji/japanese/word`, `romaji/reading`, `english/meaning`, `tips/marathi/hint`, `category/type`.
If no header is recognized, columns are read positionally in the order above.
CSV and Excel parse most reliably; PDF table parsing is best-effort — always review the preview.

## Fonts
PDF export embeds `public/fonts/NotoSansJP-Regular.ttf` (kanji) and
`public/fonts/NotoSansDevanagari-Regular.ttf` (Marathi). Default PDF fonts cannot render these scripts.

## Notes
- No login: a single shared vocab list. Don't deploy publicly without adding protection.
- `xlsx` (SheetJS) from the npm registry has known advisories; acceptable for personal/local use.
