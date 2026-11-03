// ---------------------------------------------------------------------------
// Server-Timing for the API routes: where a request's time went — Supabase
// auth and data calls, the kanji sync, the Japanese analyzer, outside APIs —
// shown per request in DevTools (Network → Timing), no logging needed.
//
// A route opts in by wrapping its handler in withServerTiming. Work is timed
// with timed() (or the Supabase clients' timingFetch) and grouped by name for
// the request: `sb-db;dur=41.2;desc="3 calls, 52.0ms summed"`. `dur` is wall
// time with at least one such call in flight, so calls run in parallel don't
// add up past the request's total; `desc` keeps the count and the sum. Names
// can nest (kanji-sync includes its own sb-db and kanjiapi time). Outside a
// wrapped request (tests, scripts) timing is a no-op. Server-only (Node
// AsyncLocalStorage).
// ---------------------------------------------------------------------------

import { AsyncLocalStorage } from "node:async_hooks";

type Metric = {
  wall: number; // ms with at least one call in flight
  summed: number; // ms of every call added up
  calls: number;
  inFlight: number;
  busySince: number;
};

const requestMetrics = new AsyncLocalStorage<Map<string, Metric>>();

/** Await `work`, counting it toward this request's `name` metric. */
export async function timed<T>(name: string, work: PromiseLike<T>): Promise<T> {
  const metrics = requestMetrics.getStore();
  if (!metrics) return work;
  const metric =
    metrics.get(name) ??
    { wall: 0, summed: 0, calls: 0, inFlight: 0, busySince: 0 };
  metrics.set(name, metric);
  const started = performance.now();
  if (metric.inFlight++ === 0) metric.busySince = started;
  try {
    return await work;
  } finally {
    const ended = performance.now();
    metric.summed += ended - started;
    metric.calls += 1;
    if (--metric.inFlight === 0) metric.wall += ended - metric.busySince;
  }
}

/**
 * fetch for the Supabase clients: each call counts as `sb-auth` (/auth/v1) or
 * `sb-db` (everything else — PostgREST and RPCs, the only other calls made),
 * timed to the response headers (the body's download isn't included). Passed
 * as `global.fetch`, so no query needs its own timer.
 */
export const timingFetch: typeof fetch = (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const name = url.includes("/auth/v1/") ? "sb-auth" : "sb-db";
  return timed(name, fetch(input, init));
};

/** Header value for the finished metrics plus the request's total. */
function headerValue(metrics: Map<string, Metric>, totalMs: number): string {
  const entries = [...metrics]
    .filter(([, metric]) => metric.calls > 0)
    .map(([name, metric]) => {
      const calls = `${metric.calls} ${metric.calls === 1 ? "call" : "calls"}`;
      const desc =
        metric.calls === 1 ? calls : `${calls}, ${metric.summed.toFixed(1)}ms summed`;
      return `${name};dur=${metric.wall.toFixed(1)};desc="${desc}"`;
    });
  entries.push(`total;dur=${totalMs.toFixed(1)}`);
  return entries.join(", ");
}

/**
 * Wrap a route handler so its response carries a Server-Timing header. Metrics
 * from work still running when the handler returns (none here) are left out.
 */
export function withServerTiming<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return (...args) =>
    requestMetrics.run(new Map(), async () => {
      const started = performance.now();
      const response = await handler(...args);
      const metrics = requestMetrics.getStore()!;
      try {
        response.headers.append(
          "Server-Timing",
          headerValue(metrics, performance.now() - started)
        );
      } catch {
        // A response with immutable headers just goes out without timings.
      }
      return response;
    });
}
