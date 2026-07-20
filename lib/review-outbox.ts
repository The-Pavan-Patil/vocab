export type ReviewOutboxStatus = {
  pendingCount: number;
  saving: boolean;
  paused: boolean;
  error: string | null;
};

export const INITIAL_REVIEW_OUTBOX_STATUS: ReviewOutboxStatus = {
  pendingCount: 0,
  saving: false,
  paused: false,
  error: null,
};

export const MAX_PENDING_REVIEWS = 8;

type ReviewCommand = { reviewId: string };

/**
 * A single-worker FIFO outbox. The UI may enqueue several optimistic reviews,
 * but persistence stays strictly ordered and never overlaps. Failed commands
 * remain at the head until the user retries them with the same idempotency key.
 */
export class SequentialReviewOutbox<
  Command extends ReviewCommand,
  Result,
> {
  private readonly queue: Command[] = [];
  private send: (command: Command) => Promise<Result>;
  private onSuccess: (result: Result, command: Command) => void;
  private readonly onStatus: (status: ReviewOutboxStatus) => void;
  private readonly maxPending: number;
  private running = false;
  private paused = false;
  private error: string | null = null;

  constructor(
    send: (command: Command) => Promise<Result>,
    onSuccess: (result: Result, command: Command) => void,
    onStatus: (status: ReviewOutboxStatus) => void,
    maxPending = MAX_PENDING_REVIEWS
  ) {
    this.send = send;
    this.onSuccess = onSuccess;
    this.onStatus = onStatus;
    this.maxPending = maxPending;
  }

  setHandlers(
    send: (command: Command) => Promise<Result>,
    onSuccess: (result: Result, command: Command) => void
  ): void {
    this.send = send;
    this.onSuccess = onSuccess;
  }

  getStatus(): ReviewOutboxStatus {
    return {
      pendingCount: this.queue.length,
      saving: this.running,
      paused: this.paused,
      error: this.error,
    };
  }

  enqueue(command: Command): boolean {
    if (this.paused || this.queue.length >= this.maxPending) return false;
    this.queue.push(command);
    this.publish();
    void this.drain();
    return true;
  }

  retry(): void {
    if (!this.paused) return;
    this.paused = false;
    this.error = null;
    this.publish();
    void this.drain();
  }

  private publish(): void {
    this.onStatus(this.getStatus());
  }

  private async drain(): Promise<void> {
    if (this.running || this.paused) return;
    this.running = true;
    this.publish();

    try {
      while (!this.paused && this.queue.length > 0) {
        const command = this.queue[0];
        let result: Result;
        try {
          result = await this.send(command);
        } catch (error) {
          this.paused = true;
          this.error =
            error instanceof Error ? error.message : "Failed to save review";
          this.publish();
          continue;
        }

        this.queue.shift();
        this.onSuccess(result, command);
        this.publish();
      }
    } finally {
      this.running = false;
      this.publish();
    }
  }
}
