# 日本語 Vocab — Japanese Study App

A personal Next.js app for studying Japanese vocabulary. Each word has 5 attributes:
**Kanji, Romaji, English meaning, Tips (Marathi), Category** (noun/verb/adjective/…).

## Features
- **Accounts** — Supabase email/password auth. Each user has their own private vocab list
  (isolated in the database via Row Level Security). Open sign-up.
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
3. Go to **Project Settings → API keys** and copy the **Project URL** and the **publishable** (anon) key.

### 2. Configure auth (Supabase dashboard)
- **Authentication → Providers → Email:** enable it, and turn **"Confirm email" OFF** for the
  smoothest sign-up (the free-tier email sender is rate-limited; the login UI handles both modes).
- **Authentication → Sign In / Providers:** keep **"Allow new users to sign up" ON** (open sign-up).
- **Authentication → URL Configuration:** set the **Site URL** and add **Redirect URLs** for your
  origins, e.g. `http://localhost:3000/**` (and your ngrok HTTPS origin if you tunnel the dev server).

### 3. Configure environment
```bash
cp .env.local.example .env.local
```
Fill in:
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
```
Per-user data isolation is enforced by Row Level Security, so the publishable key is all the app
needs — no service-role key is stored in the app.

### 4. Run, sign up, then enable per-user lists
```bash
npm install
npm run dev
```
Open <http://localhost:3000> → you'll be redirected to **/login**. Create your owner account.
Then enable auth scoping + migrate your existing words: open **SQL Editor**, set the owner email at
the top of [`supabase/0002_auth_rls.sql`](./supabase/0002_auth_rls.sql), and run it. (It adds
`user_id`, backfills your existing rows to your account, and turns on RLS + per-user policies.)

## Import file format
The first row may be a header. Recognized column names (case-insensitive, any order):
`kanji/japanese/word`, `romaji/reading`, `english/meaning`, `tips/marathi/hint`, `category/type`.
If no header is recognized, columns are read positionally in the order above.
CSV and Excel parse most reliably; PDF table parsing is best-effort — always review the preview.

## Fonts
PDF export embeds `public/fonts/NotoSansJP-Regular.ttf` (kanji) and
`public/fonts/NotoSansDevanagari-Regular.ttf` (Marathi). Default PDF fonts cannot render these scripts.

## Auth & data model
- Email/password via Supabase Auth, using `@supabase/ssr` (cookie sessions). Session refresh and
  route gating live in [`proxy.ts`](./proxy.ts) (Next.js 16 renamed `middleware` → `proxy`).
- Every API route runs as the signed-in user through a per-request, RLS-scoped client
  ([`lib/supabase/server.ts`](./lib/supabase/server.ts)); `vocab.user_id` + RLS policies isolate data.
- Exports (.docx/PDF) contain only the signed-in user's words.

## Notes
- `xlsx` (SheetJS) from the npm registry has known advisories; acceptable for personal/local use.
