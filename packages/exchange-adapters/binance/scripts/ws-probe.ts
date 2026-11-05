import { createRequire } from 'node:module';
import { resolveProxyUrlAsync } from '../src/proxy';
import {
  createTlsThroughProxy,
  httpConnectTunnel,
  socks5Tunnel,
} from '../src/tunnel';
import { connect as tlsConnect } from 'node:tls';

const nodeRequire = createRequire(__filename);
const WebSocket = nodeRequire('ws') as {
  new (
    url: string,
    options?: { socket?: unknown },
  ): {
    on(event: string, cb: (...args: unknown[]) => void): void;
    send(data: string): void;
    close(): void;
  };
};

async function tryOnce(label: string, buildSocket: () => Promise<unknown>): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const socket = await buildSocket();
  const wsUrl = 'ws://data-stream.binance.vision/stream';
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { socket });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('timeout'));
    }, 12_000);
    ws.on('open', () => {
      console.log('open');
      ws.send(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: ['btcusdt@trade'],
          id: 1,
        }),
      );
    });
    ws.on('message', (data) => {
      console.log('message', String(data).slice(0, 180));
      clearTimeout(timer);
      ws.close();
      resolve();
    });
    ws.on('unexpected-response', (_req, res) => {
      console.log('unexpected', (res as { statusCode?: number }).statusCode);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on('close', (code, reason) => {
      console.log('close', code, String(reason));
    });
  });
}

async function main(): Promise<void> {
  const proxy = await resolveProxyUrlAsync();
  console.log('proxy=', proxy);
  const host = 'data-stream.binance.vision';

  const cases: Array<[string, () => Promise<unknown>]> = [
    [
      'socks5-10808',
      async () => {
        const raw = await socks5Tunnel('127.0.0.1', 10808, host, 443);
        return await new Promise((resolve, reject) => {
          const tls = tlsConnect({ socket: raw, servername: host }, () => resolve(tls));
          tls.once('error', reject);
        });
      },
    ],
    [
      'http-connect-10809',
      async () => {
        const raw = await httpConnectTunnel('http://127.0.0.1:10809', host, 443);
        return await new Promise((resolve, reject) => {
          const tls = tlsConnect({ socket: raw, servername: host }, () => resolve(tls));
          tls.once('error', reject);
        });
      },
    ],
    [
      'helper-both',
      async () =>
        createTlsThroughProxy({
          targetHost: host,
          httpProxyUrl: proxy,
          socksProxy: { host: '127.0.0.1', port: 10808 },
        }),
    ],
  ];

  for (const [label, build] of cases) {
    try {
      await tryOnce(label, build);
      console.log(label, 'SUCCESS');
      return;
    } catch (error) {
      console.log(
        label,
        'FAIL',
        error instanceof Error ? error.message : error,
      );
    }
  }
  throw new Error('all ws tunnel modes failed');
}

main().catch((error) => {
  console.error('FAILED', error);
  process.exitCode = 1;
});
