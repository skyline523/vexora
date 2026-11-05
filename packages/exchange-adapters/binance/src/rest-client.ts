import type { Logger, MarketType } from '@vexora/shared';
import {
  BINANCE_REST_BASE,
  DEFAULT_REST_TIMEOUT_MS,
} from './constants';
import { BinanceApiError, isRetryableHttpStatus } from './errors';
import {
  createProxyAwareFetch,
  resolveProxyUrl,
  type ProxyAwareFetch,
} from './proxy';
import { WeightRateLimiter } from './rate-limiter';

export interface RestClientOptions {
  bases?: Partial<Record<MarketType, string>>;
  timeoutMs?: number;
  limiter?: WeightRateLimiter;
  /** Explicit HTTP(S) proxy, e.g. http://127.0.0.1:10809 */
  proxyUrl?: string;
  fetchImpl?: ProxyAwareFetch;
  logger?: Logger;
}

export class BinanceRestClient {
  private readonly bases: Record<MarketType, string>;
  private readonly timeoutMs: number;
  private readonly limiter: WeightRateLimiter;
  private readonly fetchImpl: ProxyAwareFetch;
  private readonly logger?: Logger;
  readonly proxyUrl?: string;

  constructor(options: RestClientOptions = {}) {
    this.bases = {
      spot: options.bases?.spot ?? BINANCE_REST_BASE.spot,
      usdt_perpetual:
        options.bases?.usdt_perpetual ?? BINANCE_REST_BASE.usdt_perpetual,
    };
    this.proxyUrl = options.proxyUrl;
    // Proxy CONNECT tunnels (Clash etc.) are slower; give them more headroom.
    this.timeoutMs =
      options.timeoutMs ??
      (options.proxyUrl || resolveProxyUrl()
        ? 60_000
        : DEFAULT_REST_TIMEOUT_MS);
    this.limiter = options.limiter ?? new WeightRateLimiter();
    this.fetchImpl =
      options.fetchImpl ?? createProxyAwareFetch(options.proxyUrl);
    this.logger = options.logger;
  }

  async getJson<T>(
    marketType: MarketType,
    path: string,
    query?: Record<string, string | number | undefined>,
    weight = 1,
  ): Promise<T> {
    await this.limiter.schedule(weight);

    const url = new URL(path, this.bases[marketType]);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger?.debug('rest.request', {
        marketType,
        path,
        weight,
        proxy: this.proxyUrl ? 'on' : 'off',
      });

      const response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      const usedWeight =
        response.headers.get('x-mbx-used-weight-1m') ??
        response.headers.get('x-mbx-used-weight');
      this.limiter.updateFromHeader(usedWeight);

      if (!response.ok) {
        let code: number | string = response.status;
        let message = response.statusText;
        try {
          const body = (await response.json()) as {
            code?: number;
            msg?: string;
          };
          if (body.code != null) {
            code = body.code;
          }
          if (body.msg) {
            message = body.msg;
          }
        } catch {
          // ignore body parse errors
        }
        if (response.status === 451) {
          message =
            `${message || 'Unavailable For Legal Reasons'} ` +
            `(host may be geo-blocked; spot defaults to data-api.binance.vision)`;
        }
        throw new BinanceApiError({
          status: response.status,
          code,
          message: `Binance REST ${path} failed: ${message}`,
          retryable: isRetryableHttpStatus(response.status),
        });
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof BinanceApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BinanceApiError({
          status: 408,
          code: 'TIMEOUT',
          message: `Binance REST ${path} timed out after ${this.timeoutMs}ms`,
          retryable: true,
        });
      }
      const cause =
        error instanceof Error &&
        'cause' in error &&
        error.cause instanceof Error
          ? error.cause.message
          : undefined;
      const baseMessage =
        error instanceof Error
          ? error.message
          : `Binance REST ${path} network error`;
      throw new BinanceApiError({
        status: 0,
        code: 'NETWORK',
        message: cause ? `${baseMessage}: ${cause}` : baseMessage,
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
