import { test } from "node:test";
import assert from "node:assert/strict";
import { selectAll } from "./supabase/select-all.ts";

type Row = { id: string };

// A table of `total` rows behind a server that returns at most `maxRows`.
function table(total: number, maxRows: number, { withCount = true } = {}) {
  const requests: [number, number][] = [];
  const rows: Row[] = Array.from({ length: total }, (_, index) => ({ id: `r${index}` }));
  const page = async (from: number, to: number) => {
    requests.push([from, to]);
    const end = Math.min(to + 1, from + maxRows, total);
    return { data: rows.slice(from, end), error: null, count: withCount ? total : null };
  };
  return { page, requests };
}

test("fewer rows than a page is one request", async () => {
  const { page, requests } = table(855, 1000);
  assert.equal((await selectAll(page)).length, 855);
  assert.deepEqual(requests, [[0, 999]]);
});

test("an empty table is one request", async () => {
  const { page, requests } = table(0, 1000);
  assert.deepEqual(await selectAll(page), []);
  assert.equal(requests.length, 1);
});

test("more rows than the server's cap are read page by page", async () => {
  const { page, requests } = table(2300, 1000);
  const rows = await selectAll(page);
  assert.equal(rows.length, 2300);
  assert.deepEqual(rows.slice(998, 1002).map((row) => row.id), ["r998", "r999", "r1000", "r1001"]);
  assert.deepEqual(requests, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("a project capped below the page size continues from what it got", async () => {
  const { page, requests } = table(1200, 500);
  assert.equal((await selectAll(page)).length, 1200);
  assert.deepEqual(requests, [[0, 999], [500, 1499], [1000, 1999]]);
});

test("without a count, pages continue until one comes back empty", async () => {
  const { page, requests } = table(1200, 500, { withCount: false });
  assert.equal((await selectAll(page)).length, 1200);
  assert.equal(requests.at(-1)?.[0], 1200);
});

test("a row seen twice across a shifted page boundary is kept once", async () => {
  const pages = [
    { data: [{ id: "a" }, { id: "b" }], error: null, count: 4 },
    { data: [{ id: "b" }, { id: "c" }], error: null, count: 4 },
  ];
  const rows = await selectAll(async () => pages.shift()!, 2);
  assert.deepEqual(rows.map((row) => row.id), ["a", "b", "c"]);
});

test("an offset past a table that shrank mid-read ends the read", async () => {
  const pages = [
    { data: [{ id: "a" }, { id: "b" }], error: null, count: 3 },
    { data: null, error: { message: "Requested range not satisfiable", code: "PGRST103" }, count: null },
  ];
  const rows = await selectAll(async () => pages.shift()!, 2);
  assert.deepEqual(rows.map((row) => row.id), ["a", "b"]);
});

test("an error is thrown, not returned as a short list", async () => {
  await assert.rejects(
    selectAll(async () => ({ data: null, error: { message: "boom" }, count: null })),
    /boom/
  );
});
