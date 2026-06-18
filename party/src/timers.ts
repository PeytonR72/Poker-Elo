/**
 * TurnTimer — thin wrapper around setTimeout so tests can use fake timers.
 */
export class TurnTimer {
  private handle: ReturnType<typeof setTimeout> | null = null;

  start(ms: number, onExpire: () => void): void {
    this.cancel();
    this.handle = setTimeout(onExpire, ms);
  }

  cancel(): void {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}
