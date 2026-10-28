// Tests for the next-review phrase (lib/relative-time.ts). Run with:
//   node --test lib/relative-time.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUntil } from "./relative-time.ts";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

test("minutes, never less than one", () => {
  assert.equal(formatUntil(0), "in 1 minute");
  assert.equal(formatUntil(10_000), "in 1 minute");
  assert.equal(formatUntil(45 * MIN), "in 45 minutes");
});

test("hours and days, with correct plurals", () => {
  assert.equal(formatUntil(HOUR), "in 1 hour");
  assert.equal(formatUntil(3 * HOUR), "in 3 hours");
  assert.equal(formatUntil(DAY), "in 1 day");
  assert.equal(formatUntil(5 * DAY), "in 5 days");
});
