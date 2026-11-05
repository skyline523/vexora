import {
  createProxyAwareFetch,
  resolveProxyUrlAsync,
} from '../src/proxy';

async function main(): Promise<void> {
  const proxy = await resolveProxyUrlAsync();
  console.log('proxy=', proxy);
  const fetchImpl = createProxyAwareFetch(proxy);
  const urls = [
    'https://data-api.binance.vision/api/v3/ping',
    'https://data-api.binance.vision/api/v3/time',
    'https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT',
    'https://data-api.binance.vision/api/v3/exchangeInfo?symbol=BTCUSDT',
  ];
  for (const url of urls) {
    const started = Date.now();
    try {
      const res = await fetchImpl(url, {
        signal: AbortSignal.timeout(20_000),
      });
      const text = await res.text();
      console.log(
        'OK',
        res.status,
        `${Date.now() - started}ms`,
        url,
        text.slice(0, 80),
      );
    } catch (error) {
      console.log(
        'FAIL',
        `${Date.now() - started}ms`,
        url,
        error instanceof Error ? error.message : error,
      );
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
