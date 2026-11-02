/** Coalesced wakeup only. Durable SQL claims remain the authority for work. */
export class LycheeImmediateQueue {
  private pending = false;
  private draining = false;
  private stopped = false;
  private scheduled?: ReturnType<typeof setImmediate>;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly busy: () => boolean,
    private readonly onError: () => void,
  ) {}

  request(): void {
    if (this.stopped) return;
    this.pending = true;
    this.draining = true;
    this.schedule();
  }

  idle(hadJob: boolean): void {
    if (this.stopped) return;
    // Drain a burst via fresh SQL claims, not one callback per duplicate webhook.
    if (this.draining && hadJob) this.pending = true;
    if (!this.pending) this.draining = false;
    this.schedule();
  }

  stop(): void {
    this.stopped = true;
    if (this.scheduled) clearImmediate(this.scheduled);
    this.scheduled = undefined;
    this.pending = false;
  }

  private schedule(): void {
    if (this.stopped || !this.pending || this.scheduled || this.busy()) return;
    this.scheduled = setImmediate(() => {
      this.scheduled = undefined;
      // A periodic tick may have started since the wakeup was scheduled.
      // Leave pending set so its finally block will reschedule us.
      if (this.stopped || this.busy()) return;
      this.pending = false;
      void this.run().catch(() => {
        this.onError();
        this.idle(false);
      });
    });
  }
}
