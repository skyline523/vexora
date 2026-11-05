import type { Trade } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import { TradeBuffer } from './trade-buffer';

function trade(tradeId: string, ts: number): Trade {
  return {
    symbolId: 'binance:spot:BTC/USDT',
    tradeId,
    price: ts,
    qty: 1,
    side: 'buy',
    ts,
    receivedAt: ts,
  };
}

describe('TradeBuffer', () => {
  it('dedupes by tradeId and sorts late prints', () => {
    const buffer = new TradeBuffer(10);
    expect(buffer.push(trade('2', 2_000))).toBe(true);
    expect(buffer.push(trade('1', 1_000))).toBe(true);
    expect(buffer.push(trade('2', 2_500))).toBe(false);

    expect(buffer.get('binance:spot:BTC/USDT').map((row) => row.tradeId)).toEqual(['1', '2']);
  });

  it('drops the oldest print when the ring is full', () => {
    const buffer = new TradeBuffer(2);
    buffer.push(trade('1', 1));
    buffer.push(trade('2', 2));
    buffer.push(trade('3', 3));
    expect(buffer.push(trade('0', 0))).toBe(false);

    expect(buffer.get('binance:spot:BTC/USDT').map((row) => row.tradeId)).toEqual(['2', '3']);
  });
});
