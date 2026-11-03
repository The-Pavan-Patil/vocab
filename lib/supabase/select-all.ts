// PostgREST caps every response at the project's max rows (1000 on Supabase by
// default) and truncates without an error. Any read that must see EVERY row —
// the word list, a full kanji sync, duplicate detection — pages through
// selectAll instead of trusting one response.

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string; code?: string } | null;
  count: number | null;
}>;

// PostgREST's answer to an offset past the last row — the table shrank while
// it was being paged.
const RANGE_NOT_SATISFIABLE = "PGRST103";

/**
 * Read a query page by page. `page(from, to)` builds the query for rows
 * from..to (inclusive): it should request `{ count: "exact" }` and a stable
 * order, and end with `.range(from, to)`. Pages continue until the exact count
 * is reached (without a count, until a page comes back empty), so a project
 * configured with fewer max rows still reads them all. The common case (fewer
 * rows than one page) is a single request.
 *
 * Each page is its own query: a row added or deleted mid-read can shift a
 * page boundary, so a row seen twice is kept once, an offset that falls past
 * a shrunken table ends the read, and a delete can make one row past the
 * boundary go unread. Only lists longer than a page are exposed, and only
 * while they change mid-read.
 */
export async function selectAll<T extends { id: string }>(
  page: (from: number, to: number) => Page<T>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; ) {
    const { data, error, count } = await page(offset, offset + pageSize - 1);
    if (error) {
      if (error.code === RANGE_NOT_SATISFIABLE && offset > 0) return rows;
      throw new Error(error.message);
    }
    const batch = data ?? [];
    offset += batch.length;
    for (const row of batch) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
    if (batch.length === 0 || (count !== null && offset >= count)) return rows;
  }
}
