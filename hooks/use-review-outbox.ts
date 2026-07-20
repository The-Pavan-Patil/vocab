"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import {
  INITIAL_REVIEW_OUTBOX_STATUS,
  MAX_PENDING_REVIEWS,
  SequentialReviewOutbox,
} from "@/lib/review-outbox";

type ReviewCommand = { reviewId: string };

export function useReviewOutbox<Command extends ReviewCommand, Result>({
  send,
  onSuccess,
  maxPending = MAX_PENDING_REVIEWS,
}: {
  send: (command: Command) => Promise<Result>;
  onSuccess: (result: Result, command: Command) => void;
  maxPending?: number;
}) {
  const [status, setStatus] = useState(INITIAL_REVIEW_OUTBOX_STATUS);
  const [outbox] = useState(
    () =>
      new SequentialReviewOutbox<Command, Result>(
        send,
        onSuccess,
        setStatus,
        maxPending
      )
  );

  useLayoutEffect(() => {
    outbox.setHandlers(send, onSuccess);
  }, [onSuccess, outbox, send]);

  const enqueue = useCallback(
    (command: Command) => outbox.enqueue(command),
    [outbox]
  );
  const retry = useCallback(() => outbox.retry(), [outbox]);

  return {
    ...status,
    blocked: status.paused || status.pendingCount >= maxPending,
    enqueue,
    retry,
  };
}
