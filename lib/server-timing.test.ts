import { test } from "node:test";
import assert from "node:assert/strict";
import { timed, withServerTiming } from "./server-timing.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("a wrapped handler reports each timed name, summed, plus the total", async () => {
  const handler = withServerTiming(async (word: string) => {
    await timed("sb-db", wait(5));
    await timed("sb-db", wait(5));
    await timed("kanji-sync", wait(1));
    return new Response(word);
  });
  const response = await handler("食べる");
  assert.equal(await response.text(), "食べる");
  const header = response.headers.get("Server-Timing") ?? "";
  assert.match(
    header,
    /^sb-db;dur=\d+\.\d;desc="2 calls, \d+\.\dms summed", kanji-sync;dur=\d+\.\d;desc="1 call", total;dur=\d+\.\d$/
  );
});

test("concurrent requests keep their own metrics", async () => {
  const handler = withServerTiming(async (name: string) => {
    await timed(name, wait(2));
    return new Response(null);
  });
  const [a, b] = await Promise.all([handler("a"), handler("b")]);
  assert.match(a.headers.get("Server-Timing") ?? "", /^a;/);
  assert.doesNotMatch(a.headers.get("Server-Timing") ?? "", /\bb;/);
  assert.match(b.headers.get("Server-Timing") ?? "", /^b;/);
});

test("timing outside a wrapped request is a no-op that still returns and throws", async () => {
  assert.equal(await timed("x", Promise.resolve(42)), 42);
  await assert.rejects(timed("x", Promise.reject(new Error("boom"))), /boom/);
});

test("parallel calls report wall time, not their sum", async () => {
  const handler = withServerTiming(async () => {
    await Promise.all([timed("kanjiapi", wait(30)), timed("kanjiapi", wait(30)), timed("kanjiapi", wait(30))]);
    return new Response(null);
  });
  const header = (await handler()).headers.get("Server-Timing") ?? "";
  const [, wall, summed] = header.match(/kanjiapi;dur=([\d.]+);desc="3 calls, ([\d.]+)ms summed"/) ?? [];
  const total = Number(header.match(/total;dur=([\d.]+)/)?.[1]);
  assert.ok(Number(wall) <= total, `${wall} <= ${total}`);
  assert.ok(Number(summed) > Number(wall) * 2, `${summed} > 2 × ${wall}`);
});
