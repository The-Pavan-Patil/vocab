import assert from "node:assert/strict";
import { test } from "node:test";
import { createReviewId, isReviewId } from "./review-command.ts";
import { SequentialReviewOutbox } from "./review-outbox.ts";

type Command = { reviewId: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test("review IDs are UUIDs and malformed IDs are rejected", () => {
  const id = createReviewId();
  assert.equal(isReviewId(id), true);
  assert.equal(isReviewId("not-a-review-id"), false);
  assert.equal(isReviewId(null), false);
});

test("the outbox sends commands strictly one at a time in FIFO order", async () => {
  const first = deferred<string>();
  const second = deferred<string>();
  const started: string[] = [];
  const saved: string[] = [];
  const promises = [first.promise, second.promise];

  const outbox = new SequentialReviewOutbox<Command, string>(
    (command) => {
      started.push(command.reviewId);
      return promises[started.length - 1];
    },
    (result) => saved.push(result),
    () => {}
  );

  assert.equal(outbox.enqueue({ reviewId: "first" }), true);
  assert.equal(outbox.enqueue({ reviewId: "second" }), true);
  assert.deepEqual(started, ["first"]);
  assert.equal(outbox.getStatus().pendingCount, 2);

  first.resolve("saved-first");
  await nextTurn();
  assert.deepEqual(started, ["first", "second"]);
  assert.deepEqual(saved, ["saved-first"]);
  assert.equal(outbox.getStatus().pendingCount, 1);

  second.resolve("saved-second");
  await nextTurn();
  assert.deepEqual(saved, ["saved-first", "saved-second"]);
  assert.deepEqual(outbox.getStatus(), {
    pendingCount: 0,
    saving: false,
    paused: false,
    error: null,
  });
});

test("a failure pauses the queue and retry reuses the same command", async () => {
  const attempts: string[] = [];
  const saved: string[] = [];
  let failFirstAttempt = true;
  const outbox = new SequentialReviewOutbox<Command, string>(
    async (command) => {
      attempts.push(command.reviewId);
      if (command.reviewId === "first" && failFirstAttempt) {
        failFirstAttempt = false;
        throw new Error("network unavailable");
      }
      return command.reviewId;
    },
    (result) => saved.push(result),
    () => {}
  );

  outbox.enqueue({ reviewId: "first" });
  outbox.enqueue({ reviewId: "second" });
  await nextTurn();

  assert.deepEqual(attempts, ["first"]);
  assert.deepEqual(saved, []);
  assert.deepEqual(outbox.getStatus(), {
    pendingCount: 2,
    saving: false,
    paused: true,
    error: "network unavailable",
  });

  outbox.retry();
  await nextTurn();

  assert.deepEqual(attempts, ["first", "first", "second"]);
  assert.deepEqual(saved, ["first", "second"]);
  assert.equal(outbox.getStatus().pendingCount, 0);
  assert.equal(outbox.getStatus().paused, false);
});

test("the outbox applies backpressure at its configured pending limit", () => {
  const waiting = deferred<string>();
  const outbox = new SequentialReviewOutbox<Command, string>(
    () => waiting.promise,
    () => {},
    () => {},
    2
  );

  assert.equal(outbox.enqueue({ reviewId: "first" }), true);
  assert.equal(outbox.enqueue({ reviewId: "second" }), true);
  assert.equal(outbox.enqueue({ reviewId: "third" }), false);
  assert.equal(outbox.getStatus().pendingCount, 2);
});
