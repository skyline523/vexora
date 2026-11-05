import type { Trade } from '@vexora/shared';

export class TradeBuffer {
  private readonly buffers = new Map<string, Trade[]>();

  constructor(private readonly maxPerSymbol = 300) {
    if (maxPerSymbol < 1) {
      throw new Error('maxPerSymbol must be at least 1');
    }
  }

  /** Insert by time. Duplicate tradeId values are ignored. Too-old prints are dropped. */
  push(trade: Trade): boolean {
    const existing = this.buffers.get(trade.symbolId) ?? [];
    if (existing.some((row) => row.tradeId === trade.tradeId)) return false;

    const oldest = existing[0];
    if (existing.length >= this.maxPerSymbol && oldest && trade.ts < oldest.ts) {
      return false;
    }

    const next = [...existing, trade].sort(
      (left, right) => left.ts - right.ts || left.tradeId.localeCompare(right.tradeId),
    );
    if (next.length > this.maxPerSymbol) {
      next.splice(0, next.length - this.maxPerSymbol);
    }
    this.buffers.set(trade.symbolId, next);
    return true;
  }

  get(symbolId: string): Trade[] {
    return (this.buffers.get(symbolId) ?? []).map((trade) => ({ ...trade }));
  }
}
