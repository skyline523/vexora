import { createMarketSymbol } from '@vexora/shared';
import { describe, expect, it } from 'vitest';
import {
  mapInstrument,
  mapOrderBook,
  mapRestKline,
  mapTicker,
  mapWsKline,
  mapWsTrade,
  streamNameForKline,
  streamNameForOrderBook,
  streamNameForTrade,
} from './mappers';

const btcSpot = createMarketSymbol({
  exchange: 'binance',
  marketType: 'spot',
  base: 'BTC',
  quote: 'USDT',
});

describe('binance mappers', () => {
  it('maps spot instrument from exchangeInfo symbol', () => {
    const instrument = mapInstrument(
      {
        symbol: 'BTCUSDT',
        status: 'TRADING',
        baseAsset: 'BTC',
        quoteAsset: 'USDT',
        filters: [
          { filterType: 'PRICE_FILTER', tickSize: '0.01000000' },
          { filterType: 'LOT_SIZE', stepSize: '0.00001000' },
        ],
      },
      'spot',
    );
    expect(instrument).toMatchObject({
      status: 'trading',
      pricePrecision: 2,
      quantityPrecision: 5,
      symbol: {
        symbolId: 'binance:spot:BTC/USDT',
        rawSymbol: 'BTCUSDT',
      },
    });
  });

  it('filters non-perpetual futures contracts', () => {
    expect(
      mapInstrument(
        {
          symbol: 'BTCUSDT_123',
          status: 'TRADING',
          baseAsset: 'BTC',
          quoteAsset: 'USDT',
          contractType: 'CURRENT_QUARTER',
        },
        'usdt_perpetual',
      ),
    ).toBeNull();
  });

  it('maps ticker / kline / trade / orderbook', () => {
    const ticker = mapTicker(
      {
        symbol: 'BTCUSDT',
        lastPrice: '100',
        bidPrice: '99',
        askPrice: '101',
        highPrice: '110',
        lowPrice: '90',
        volume: '12.5',
        quoteVolume: '1250',
        priceChangePercent: '1.5',
        closeTime: 1_700_000_000_000,
      },
      btcSpot,
      1_700_000_000_100,
    );
    expect(ticker.lastPrice).toBe(100);
    expect(ticker.priceChangePercent24h).toBe(1.5);

    const kline = mapRestKline(
      [
        1_700_000_000_000,
        '1',
        '2',
        '0.5',
        '1.5',
        '10',
        1_700_000_059_999,
        '15',
        42,
        '4',
        '6',
        '0',
      ],
      btcSpot,
      '1m',
      1_700_000_100_000,
    );
    expect(kline).toMatchObject({
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      closed: true,
      tradeCount: 42,
    });

    const wsKline = mapWsKline(
      {
        e: 'kline',
        E: 100,
        s: 'BTCUSDT',
        k: {
          t: 1,
          T: 2,
          s: 'BTCUSDT',
          i: '1m',
          o: '1',
          c: '2',
          h: '3',
          l: '0.5',
          v: '9',
          n: 3,
          x: false,
          q: '18',
        },
      },
      btcSpot,
      '1m',
      200,
    );
    expect(wsKline.closed).toBe(false);
    expect(wsKline.close).toBe(2);

    const trade = mapWsTrade(
      {
        e: 'trade',
        E: 10,
        s: 'BTCUSDT',
        t: 99,
        p: '100',
        q: '0.5',
        T: 11,
        m: true,
      },
      btcSpot,
      12,
    );
    expect(trade.side).toBe('sell');
    expect(trade.tradeId).toBe('99');

    const book = mapOrderBook(
      {
        lastUpdateId: 7,
        bids: [['100', '1']],
        asks: [['101', '2']],
        E: 20,
      },
      btcSpot,
      21,
    );
    expect(book.sequence).toBe('7');
    expect(book.bids[0]).toEqual({ price: 100, qty: 1 });
  });

  it('builds stream names', () => {
    expect(streamNameForKline('BTCUSDT', '1m')).toBe('btcusdt@kline_1m');
    expect(streamNameForTrade('ETHUSDT')).toBe('ethusdt@trade');
    expect(streamNameForOrderBook('BTCUSDT', 20)).toBe('btcusdt@depth20@100ms');
  });
});
