/** One foreground run at a time, with a trailing run for edits made during a pull. */
export class SyncCoordinator {
  private flight: Promise<void> | null = null;
  private requested = false;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly canRun: () => boolean,
    private enabled = true,
  ) {}

  setEnabled(enabled: boolean): void { this.enabled = enabled; }

  request(): Promise<void> {
    this.requested = true;
    if (this.flight) return this.flight;
    if (!this.enabled || !this.canRun()) return Promise.resolve();

    this.flight = Promise.resolve().then(async () => {
      try {
        while (this.requested && this.enabled && this.canRun()) {
          this.requested = false;
          await this.run();
        }
      } finally { this.flight = null; }
    });
    return this.flight;
  }
}
