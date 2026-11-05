import {
  DEFAULT_WEIGHT_HARD_LIMIT,
  DEFAULT_WEIGHT_SOFT_LIMIT,
} from './constants';

export interface RateLimiterOptions {
  softLimit?: number;
  hardLimit?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Tracks Binance REST used-weight (1m window) and paces requests
 * when approaching soft/hard limits.
 */
export class WeightRateLimiter {
  private usedWeight = 0;
  private windowStartedAt: number | undefined;
  private readonly softLimit: number;
  private readonly hardLimit: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: RateLimiterOptions = {}) {
    this.softLimit = options.softLimit ?? DEFAULT_WEIGHT_SOFT_LIMIT;
    this.hardLimit = options.hardLimit ?? DEFAULT_WEIGHT_HARD_LIMIT;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  getUsedWeight(): number {
    this.maybeResetWindow();
    return this.usedWeight;
  }

  updateFromHeader(headerValue: string | null | undefined): void {
    if (headerValue == null || headerValue === '') {
      return;
    }
    const parsed = Number(headerValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    this.maybeResetWindow();
    this.usedWeight = Math.max(this.usedWeight, parsed);
  }

  async schedule(weight: number): Promise<void> {
    const run = async (): Promise<void> => {
      this.maybeResetWindow();
      if (this.usedWeight + weight >= this.hardLimit) {
        const started = this.windowStartedAt ?? this.now();
        const waitMs = Math.max(50, 60_000 - (this.now() - started));
        await this.sleep(waitMs);
        this.maybeResetWindow();
      } else if (this.usedWeight + weight >= this.softLimit) {
        await this.sleep(200);
        this.maybeResetWindow();
      }
      this.usedWeight += weight;
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
  }

  private maybeResetWindow(): void {
    const now = this.now();
    if (
      this.windowStartedAt === undefined ||
      now - this.windowStartedAt >= 60_000
    ) {
      this.windowStartedAt = now;
      this.usedWeight = 0;
    }
  }
}
