import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { connect } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import type { Agent } from 'node:https';

const nodeRequire = createRequire(__filename);

type HttpsProxyAgentModule = {
  HttpsProxyAgent: new (url: string) => Agent;
};

const { HttpsProxyAgent } = nodeRequire(
  'https-proxy-agent',
) as HttpsProxyAgentModule;

export type ProxyAwareFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

let cachedProxyUrl: string | null | undefined;

const COMMON_LOCAL_HTTP_PORTS = [10809, 7890, 7897, 1080, 8080] as const;

/**
 * Resolve an explicit HTTP(S) proxy.
 *
 * Default is direct sockets. Clash TUN / a global VPN virtual NIC already
 * captures Node traffic; forcing the Windows system proxy breaks WSS while
 * REST still works. Production hosts should also connect directly.
 *
 * Opt in only when the process itself must use an HTTP proxy:
 *   HTTPS_PROXY / BINANCE_PROXY
 *   BINANCE_USE_SYSTEM_PROXY=1  (Windows WinINET, local debugging only)
 */
export function resolveProxyUrl(explicit?: string): string | undefined {
  if (explicit) {
    return explicit;
  }
  const fromEnv =
    process.env.BINANCE_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    process.env.ALL_PROXY ||
    process.env.all_proxy;
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.BINANCE_USE_SYSTEM_PROXY !== '1') {
    return undefined;
  }
  if (cachedProxyUrl !== undefined) {
    return cachedProxyUrl ?? undefined;
  }
  cachedProxyUrl = readWindowsInetProxy() ?? null;
  return cachedProxyUrl ?? undefined;
}

/**
 * Local Clash mixed-port. Direct `fapi.binance.com` times out from this
 * network; USDT-M REST/WS should egress here while spot stays on binance.vision.
 */
export async function detectLocalFuturesProxy(): Promise<string | undefined> {
  if (await isLocalPortOpen(7890)) {
    return 'http://127.0.0.1:7890';
  }
  return undefined;
}

export async function resolveProxyUrlAsync(
  explicit?: string,
): Promise<string | undefined> {
  const sync = resolveProxyUrl(explicit);
  if (sync || process.env.BINANCE_USE_SYSTEM_PROXY !== '1') {
    return sync;
  }
  for (const port of COMMON_LOCAL_HTTP_PORTS) {
    if (await isLocalPortOpen(port)) {
      const url = `http://127.0.0.1:${port}`;
      cachedProxyUrl = url;
      return url;
    }
  }
  cachedProxyUrl = null;
  return undefined;
}

function readWindowsInetProxy(): string | undefined {
  if (process.platform !== 'win32') {
    return undefined;
  }
  try {
    const enableOut = execFileSync(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyEnable',
      ],
      { encoding: 'utf8' },
    );
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enableOut)) {
      return undefined;
    }
    const serverOut = execFileSync(
      'reg',
      [
        'query',
        'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',
        '/v',
        'ProxyServer',
      ],
      { encoding: 'utf8' },
    );
    const match = serverOut.match(/ProxyServer\s+REG_SZ\s+(\S+)/i);
    const server = match?.[1];
    if (!server) {
      return undefined;
    }
    if (server.includes('=')) {
      const parts = Object.fromEntries(
        server.split(';').map((item) => {
          const [k, v] = item.split('=');
          return [k?.toLowerCase(), v];
        }),
      );
      const https = parts.https ?? parts.http;
      return https ? normalizeProxyUrl(https) : undefined;
    }
    return normalizeProxyUrl(server);
  } catch {
    return undefined;
  }
}

function normalizeProxyUrl(value: string): string {
  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }
  return `http://${value}`;
}

function isLocalPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(250);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function isTransientProxyError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = `${error.message} ${'code' in error ? String(error.code) : ''}`;
  return /socket disconnected|ECONNRESET|ETIMEDOUT|EPIPE|ECONNREFUSED|TLS|cert|hang up/i.test(
    message,
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Clash / system HTTP proxies are more reliable via Node https + HttpsProxyAgent
 * than undici's ProxyAgent on Windows. Keep-alive is disabled because Clash CONNECT
 * tunnels frequently drop reused sockets.
 */
export function createProxyAwareFetch(proxyUrl?: string): ProxyAwareFetch {
  const resolved = resolveProxyUrl(proxyUrl);
  if (!resolved) {
    return (input, init) => fetch(input, init);
  }

  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.protocol !== 'https:') {
      throw new Error(
        `Only https URLs are supported through proxy, got ${url.protocol}`,
      );
    }

    const method = (init.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = {};
    if (init.headers) {
      const h = new Headers(init.headers);
      h.forEach((value, key) => {
        headers[key] = value;
      });
    }

    const body =
      init.body == null
        ? undefined
        : typeof init.body === 'string' || Buffer.isBuffer(init.body)
          ? init.body
          : Buffer.from(await new Response(init.body).arrayBuffer());

    const maxAttempts = 4;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // Fresh agent each attempt avoids stale CONNECT tunnels under Clash.
      const agent = new HttpsProxyAgent(resolved);

      try {
        return await new Promise<Response>((resolve, reject) => {
          const req = httpsRequest(
            {
              protocol: url.protocol,
              hostname: url.hostname,
              port: url.port || 443,
              path: `${url.pathname}${url.search}`,
              method,
              headers,
              agent,
            },
            (res) => {
              const chunks: Buffer[] = [];
              res.on('data', (chunk: Buffer) => chunks.push(chunk));
              res.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const responseHeaders = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                  if (value == null) continue;
                  if (Array.isArray(value)) {
                    for (const item of value) responseHeaders.append(key, item);
                  } else {
                    responseHeaders.set(key, value);
                  }
                }
                resolve(
                  new Response(buffer, {
                    status: res.statusCode ?? 0,
                    statusText: res.statusMessage ?? '',
                    headers: responseHeaders,
                  }),
                );
              });
            },
          );

          req.on('error', reject);

          if (init.signal) {
            if (init.signal.aborted) {
              const err = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
              return;
            }
            init.signal.addEventListener(
              'abort',
              () => {
                const err = new Error('The operation was aborted');
                err.name = 'AbortError';
                req.destroy(err);
              },
              { once: true },
            );
          }

          if (body != null) {
            req.write(body);
          }
          req.end();
        });
      } catch (error) {
        lastError = error;
        if (
          error instanceof Error &&
          error.name === 'AbortError'
        ) {
          throw error;
        }
        if (!isTransientProxyError(error) || attempt === maxAttempts) {
          throw error;
        }
        await sleep(250 * attempt);
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error('proxy fetch failed');
  };
}

export function createWsProxyAgent(proxyUrl?: string): Agent | undefined {
  const resolved = resolveProxyUrl(proxyUrl);
  if (!resolved) {
    return undefined;
  }
  return new HttpsProxyAgent(resolved);
}

export function resetProxyCache(): void {
  cachedProxyUrl = undefined;
}
