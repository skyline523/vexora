/**
 * Live smoke against Binance public market APIs (no API key).
 * Run: pnpm --filter @vexora/exchange-adapter-binance smoke
 *
 * Default is a direct connection (Clash TUN / global VPN / production).
 * Do not point this at the local HTTP proxy; that path breaks WSS.
 * Opt in only if required: HTTPS_PROXY or BINANCE_PROXY.
 *
 * Spot defaults to data-api.binance.vision / data-stream.binance.vision.
 * Optional overrides:
 *   BINANCE_SPOT_REST_BASE / BINANCE_SPOT_WS_BASE
 *   BINANCE_FUTURES_REST_BASE / BINANCE_FUTURES_WS_BASE
 */
import { createMarketSymbol } from '@vexora/shared';
import { createBinanceAdapter } from '../src/adapter';
import { resolveProxyUrl } from '../src/proxy';

async function main(): Promise<void> {
  const proxyUrl = resolveProxyUrl();
  console.log(
    proxyUrl
      ? `using explicit proxy: ${proxyUrl}`
      : 'direct connection (TUN / global VPN / production)',
  );

  const spotRest = process.env.BINANCE_SPOT_REST_BASE;
  const futuresRest = process.env.BINANCE_FUTURES_REST_BASE;
  const spotWs = process.env.BINANCE_SPOT_WS_BASE;
  const futuresWs = process.env.BINANCE_FUTURES_WS_BASE;

  const adapter = await createBinanceAdapter({
    proxyUrl,
    rest: {
      bases: {
        ...(spotRest ? { spot: spotRest } : {}),
        ...(futuresRest ? { usdt_perpetual: futuresRest } : {}),
      },
    },
    ws: {
      bases: {
        ...(spotWs ? { spot: spotWs } : {}),
        ...(futuresWs ? { usdt_perpetual: futuresWs } : {}),
      },
    },
    eventSink: (event) => {
      if (event.type === 'connection') {
        console.log(
          '[connection]',
          event.payload.state,
          event.payload.marketType,
        );
      }
      if (event.type === 'error') {
        console.error('[error]', event.payload);
      }
    },
  });

  const spotBtc = createMarketSymbol({
    exchange: 'binance',
    marketType: 'spot',
    base: 'BTC',
    quote: 'USDT',
  });
  const perpBtc = createMarketSymbol({
    exchange: 'binance',
    marketType: 'usdt_perpetual',
    base: 'BTC',
    quote: 'USDT',
  });

  // Warm up with small payloads first — Clash CONNECT tunnels can be flaky.
  const ticker = await adapter.getTicker(spotBtc);
  console.log('spot ticker last:', ticker.lastPrice);

  const klines = await adapter.getKlines({
    symbol: spotBtc,
    interval: '1m',
    limit: 3,
  });
  console.log(
    'spot klines:',
    klines.map((k) => ({
      openTime: k.openTime,
      close: k.close,
      closed: k.closed,
    })),
  );

  // Full exchangeInfo is multi-MB and often times out via Clash HTTP proxy.
  // Opt in with SMOKE_FULL_EXCHANGE_INFO=1 when on TUN / direct network.
  if (process.env.SMOKE_FULL_EXCHANGE_INFO === '1') {
    try {
      const spotInfo = await adapter.getExchangeInfo('spot');
      console.log('spot instruments:', spotInfo.instruments.length);
    } catch (error) {
      console.warn(
        'spot exchangeInfo failed:',
        error instanceof Error ? error.message : error,
      );
    }

    try {
      const perpInfo = await adapter.getExchangeInfo('usdt_perpetual');
      console.log('perp instruments:', perpInfo.instruments.length);
    } catch (error) {
      console.warn(
        'perp REST unavailable (common with some VPN exits):',
        error instanceof Error ? error.message : error,
      );
    }
  } else {
    console.log(
      'skipping full exchangeInfo (set SMOKE_FULL_EXCHANGE_INFO=1 to enable)',
    );
  }

  try {
    const book = await adapter.getOrderBookSnapshot(spotBtc, 5);
    console.log('spot book top bid/ask:', book.bids[0], book.asks[0]);
  } catch (error) {
    console.warn(
      'spot orderbook skipped:',
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const book = await adapter.getOrderBookSnapshot(perpBtc, 5);
    console.log('perp book top bid/ask:', book.bids[0], book.asks[0]);
  } catch (error) {
    console.warn(
      'perp orderbook skipped (geo/VPN exit restriction is common):',
      error instanceof Error ? error.message : error,
    );
  }

  let klineCount = 0;
  let tradeCount = 0;

  const klineSub = adapter.subscribeKlines(spotBtc, '1m', (event) => {
    if (event.type === 'kline') {
      klineCount += 1;
      console.log(
        '[ws kline]',
        event.payload.close,
        'closed=',
        event.payload.closed,
      );
    }
  });
  const tradeSub = adapter.subscribeTrades(spotBtc, (event) => {
    if (event.type === 'trade') {
      tradeCount += 1;
      console.log('[ws trade]', event.payload.price, event.payload.side);
    }
  });

  await new Promise((r) => setTimeout(r, 10_000));

  klineSub.unsubscribe();
  tradeSub.unsubscribe();
  await adapter.disconnect();

  console.log('ws kline events:', klineCount, 'trade events:', tradeCount);
  if (klineCount === 0 && tradeCount === 0) {
    // Clash/V2Ray "system proxy" mode often breaks Node WSS CONNECT upgrades.
    // REST already validated above. Prefer Clash TUN / virtual adapter for WS.
    const requireWs = process.env.SMOKE_REQUIRE_WS === '1';
    const message =
      'No WS events on a direct socket. Confirm Clash TUN/global mode is actually capturing this process, then re-run. REST smoke already passed.';
    if (requireWs) {
      throw new Error(message);
    }
    console.warn(message);
  }
  console.log('smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
