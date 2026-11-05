import type { Kline } from '@vexora/shared';

export interface FrameScheduler {
  request(callback: () => void): number;
  cancel(id: number): void;
}

export const animationFrameScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

/** Keep the latest candle per openTime and flush once per frame. */
export class RealtimeCoalescer {
  private readonly pending = new Map<number, Kline>();
  private frame: number | null = null;

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly onFlush: (klines: Kline[]) => void,
  ) {}

  push(kline: Kline): void {
    this.pending.set(kline.openTime, kline);
    if (this.frame != null) return;
    this.frame = this.scheduler.request(() => {
      this.frame = null;
      const batch = [...this.pending.values()].sort(
        (left, right) => left.openTime - right.openTime,
      );
      this.pending.clear();
      if (batch.length > 0) this.onFlush(batch);
    });
  }

  cancel(): void {
    if (this.frame != null) {
      this.scheduler.cancel(this.frame);
    }
    this.frame = null;
    this.pending.clear();
  }
}
