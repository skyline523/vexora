import { createMarketSymbol, type Kline, type MarketEvent, type MarketSink } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import { MarketClientSession, type KlineStreamSource } from './market-session';

const symbol = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});

function kline(close: number): Kline {
  return {
    symbolId: symbol.symbolId,
    interval: '1m',
    openTime: 60_000,
    closeTime: 119_999,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: false,
    ts: 60_000,
    receivedAt: 60_000,
  };
}

function fakeSource(): KlineStreamSource & {
  subs: number;
  listener?: MarketSink;
  switched: boolean;
} {
  let listener: MarketSink | undefined;
  const source = {
    subs: 0,
    switched: false,
    listener,
    subscribeKlines(_symbol: unknown, _interval: unknown, sink?: MarketSink) {
      source.subs += 1;
      source.listener = sink;
      return {
        id: 'sub_1',
        unsubscribe() {
          source.subs -= 1;
          source.listener = undefined;
        },
      };
    },
    subscribeTicker() {
      return { id: 'sub_ticker', unsubscribe() {} };
    },
    switchKlines() {
      source.switched = true;
    },
    subscribeEvents() {
      return () => undefined;
    },
  };
  return source;
}

describe('MarketClientSession', () => {
  it('subscribes once, switches the same subscription, and releases it on close', () => {
    const source = fakeSource();
    const sent: unknown[] = [];
    const session = new MarketClientSession(source, {
      send(data) {
        sent.push(JSON.parse(data));
      },
    });

    session.handleMessage(
      JSON.stringify({
        type: 'market.subscribe',
        requestId: 'r1',
        payload: { channel: 'kline', symbolId: symbol.symbolId, interval: '1m' },
      }),
    );
    session.handleMessage(
      JSON.stringify({
        type: 'market.subscribe',
        requestId: 'r2',
        payload: { channel: 'kline', symbolId: symbol.symbolId, interval: '5m' },
      }),
    );

    const event: MarketEvent = { type: 'kline', payload: kline(10) };
    source.listener?.(event);
    session.handleMessage(JSON.stringify({ type: 'sys.ping' }));
    session.close();
    source.listener?.(event);

    expect(source.subs).toBe(0);
    expect(source.switched).toBe(true);
    expect(sent.map((message) => (message as { type: string }).type)).toEqual([
      'market.subscribed',
      'market.subscribed',
      'market.kline',
      'sys.pong',
    ]);
  });

  it('stops forwarding after unsubscribe', () => {
    const source = fakeSource();
    const sent: string[] = [];
    const session = new MarketClientSession(source, {
      send(data) {
        sent.push(JSON.parse(data).type as string);
      },
    });
    session.handleMessage(
      JSON.stringify({
        type: 'market.subscribe',
        payload: { channel: 'kline', symbolId: symbol.symbolId, interval: '1m' },
      }),
    );
    session.handleMessage(JSON.stringify({ type: 'market.unsubscribe', requestId: 'r4' }));
    source.listener?.({ type: 'kline', payload: kline(1) });
    expect(sent).toEqual(['market.subscribed', 'market.unsubscribed']);
    session.close();
  });
});
