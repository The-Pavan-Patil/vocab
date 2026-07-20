/** A review command id is persisted in `reviews` to make retries idempotent. */
export function createReviewId(): string {
  return globalThis.crypto.randomUUID();
}

export function isReviewId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}
