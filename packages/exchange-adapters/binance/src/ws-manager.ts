import {
  createLogger,
  type ConnectionStatus,
  type Logger,
  type MarketSink,
  type MarketType,
} from '@vexora/shared';
import { createRequire } from 'node:module';
import type { Agent } from 'node:https';
import type { Duplex } from 'node:stream';
import {
  BINANCE_EXCHANGE_ID,
  BINANCE_WS_BASE,
  WS_CONTROL_MIN_INTERVAL_MS,
  WS_RECONNECT_DELAYS_MS,
} from './constants';
import { createWsProxyAgent, resolveProxyUrl } from './proxy';

const nodeRequire = createRequire(__filename);
type WsCtor = new (
  url: string,
  options?: { agent?: Agent; socket?: Duplex },
) => WebSocket;
const WebSocketNode = nodeRequire('ws') as WsCtor;

export type WsFactory = (url: string) => WebSocket | Promise<WebSocket>;

interface StreamHandler {
  stream: string;
  onMessage: (payload: unknown) => void;
}

export interface BinanceWsManagerOptions {
  bases?: Partial<Record<MarketType, string>>;
  wsFactory?: WsFactory;
  /** Explicit HTTP(S) proxy for WSS CONNECT tunnel. Used when a market has no override. */
  proxyUrl?: string;
  /** Per-market proxy. Spot stays direct when only USDT-M needs a local HTTP proxy. */
  proxies?: Partial<Record<MarketType, string | undefined>>;
  logger?: Logger;
  sink?: MarketSink;
  reconnectDelaysMs?: readonly number[];
  controlMinIntervalMs?: number;
  now?: () => number;
}

/** Compatible with browser WebSocket and the `ws` package. */
const WS_CONNECTING = 0;
const WS_OPEN = 1;

function createDefaultWsFactory(proxyUrl?: string): WsFactory {
  const resolvedProxy = resolveProxyUrl(proxyUrl);
  if (!resolvedProxy) {
    return (url) => new WebSocketNode(url) as unknown as WebSocket;
  }

  // HttpsProxyAgent matches the REST path. A hand-rolled TLS tunnel often
  // opens and then dies, which stalls kline updates behind a live HTTP history.
  return (url) => {
    const agent = createWsProxyAgent(resolvedProxy);
    return new WebSocketNode(url, agent ? { agent } : undefined) as unknown as WebSocket;
  };
}

/**
 * One combined-stream WebSocket per market type.
 * Supports dynamic subscribe/unsubscribe with reconnect + resubscribe.
 */
export class BinanceWsManager {
  private readonly bases: Record<MarketType, string>;
  private readonly wsFactories: Record<MarketType, WsFactory>;
  private readonly logger: Logger;
  private readonly reconnectDelaysMs: readonly number[];
  private readonly controlMinIntervalMs: number;
  private readonly now: () => number;
  private sink?: MarketSink;

  private readonly sockets = new Map<MarketType, WebSocket>();
  private readonly handlers = new Map<MarketType, Map<string, Set<StreamHandler>>>();
  private readonly reconnectAttempt = new Map<MarketType, number>();
  private readonly reconnectTimers = new Map<MarketType, ReturnType<typeof setTimeout>>();
  private readonly lastControlAt = new Map<MarketType, number>();
  private readonly controlQueues = new Map<MarketType, Promise<void>>();
  private readonly connecting = new Set<MarketType>();
  private nextRequestId = 1;
  private closed = false;

  constructor(options: BinanceWsManagerOptions = {}) {
    this.bases = {
      spot: options.bases?.spot ?? BINANCE_WS_BASE.spot,
      usdt_perpetual:
        options.bases?.usdt_perpetual ?? BINANCE_WS_BASE.usdt_perpetual,
    };
    const shared = options.wsFactory;
    this.wsFactories = {
      spot:
        shared ??
        createDefaultWsFactory(options.proxies?.spot ?? options.proxyUrl),
      usdt_perpetual:
        shared ??
        createDefaultWsFactory(
          options.proxies?.usdt_perpetual ?? options.proxyUrl,
        ),
    };
    this.logger =
      options.logger ?? createLogger('binance-ws', { level: 'info' });
    this.sink = options.sink;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? WS_RECONNECT_DELAYS_MS;
    this.controlMinIntervalMs =
      options.controlMinIntervalMs ?? WS_CONTROL_MIN_INTERVAL_MS;
    this.now = options.now ?? Date.now;
  }

  setSink(sink: MarketSink | undefined): void {
    this.sink = sink;
  }

  subscribe(
    marketType: MarketType,
    stream: string,
    onMessage: (payload: unknown) => void,
  ): () => void {
    if (this.closed) {
      throw new Error('BinanceWsManager is closed');
    }

    const marketHandlers =
      this.handlers.get(marketType) ?? new Map<string, Set<StreamHandler>>();
    this.handlers.set(marketType, marketHandlers);

    const set = marketHandlers.get(stream) ?? new Set<StreamHandler>();
    marketHandlers.set(stream, set);

    const handler: StreamHandler = { stream, onMessage };
    const isFirst = set.size === 0;
    set.add(handler);

    void this.ensureConnected(marketType).then(async () => {
      if (isFirst && this.isOpen(marketType)) {
        await this.sendControl(marketType, 'SUBSCRIBE', [stream]);
      }
    });

    return () => {
      const current = marketHandlers.get(stream);
      if (!current) {
        return;
      }
      current.delete(handler);
      if (current.size > 0) {
        return;
      }
      marketHandlers.delete(stream);
      if (this.isOpen(marketType)) {
        void this.sendControl(marketType, 'UNSUBSCRIBE', [stream]);
      }
      if (marketHandlers.size === 0) {
        this.teardownSocket(marketType, false);
      }
    };
  }

  async disconnect(): Promise<void> {
    this.closed = true;
    for (const marketType of [...this.sockets.keys(), ...this.handlers.keys()]) {
      this.clearReconnect(marketType);
      this.teardownSocket(marketType, true);
    }
    this.handlers.clear();
  }

  private async ensureConnected(marketType: MarketType): Promise<void> {
    if (this.closed) {
      return;
    }
    if (this.isOpen(marketType)) {
      return;
    }
    this.connect(marketType);
  }

  private connect(marketType: MarketType): void {
    if (this.closed) {
      return;
    }

    const existing = this.sockets.get(marketType);
    if (
      existing &&
      (existing.readyState === WS_OPEN ||
        existing.readyState === WS_CONNECTING)
    ) {
      return;
    }
    if (this.connecting.has(marketType)) {
      return;
    }

    this.emitConnection(marketType, this.reconnectAttempt.get(marketType)
      ? 'reconnecting'
      : 'connecting');

    const url = `${this.bases[marketType]}/stream`;
    this.connecting.add(marketType);
    void this.openSocket(marketType, url).finally(() => {
      this.connecting.delete(marketType);
    });
  }

  private async openSocket(marketType: MarketType, url: string): Promise<void> {
    let ws: WebSocket;
    try {
      ws = await this.wsFactories[marketType](url);
    } catch (error) {
      this.logger.error('ws.create_failed', {
        marketType,
        error: error instanceof Error ? error.message : String(error),
      });
      this.scheduleReconnect(marketType);
      return;
    }

    // Attach early to avoid unhandled 'error' when closing a CONNECTING socket.
    ws.addEventListener('error', (event) => {
      const detail = event as Event & { message?: string; error?: { message?: string } };
      this.logger.warn('ws.error', {
        marketType,
        error: detail.error?.message ?? detail.message ?? 'websocket error',
      });
    });

    if (this.closed) {
      this.safeClose(ws);
      return;
    }

    this.sockets.set(marketType, ws);

    ws.addEventListener('open', () => {
      this.reconnectAttempt.set(marketType, 0);
      this.emitConnection(marketType, 'connected');
      const streams = [...(this.handlers.get(marketType)?.keys() ?? [])];
      if (streams.length > 0) {
        void this.sendControl(marketType, 'SUBSCRIBE', streams);
      }
    });

    ws.addEventListener('message', (event) => {
      this.handleMessage(marketType, event.data);
    });

    ws.addEventListener('close', () => {
      this.sockets.delete(marketType);
      this.emitConnection(marketType, 'disconnected');
      if (!this.closed && (this.handlers.get(marketType)?.size ?? 0) > 0) {
        this.scheduleReconnect(marketType);
      }
    });
  }

  private safeClose(ws: WebSocket): void {
    try {
      const nodeWs = ws as WebSocket & { terminate?: () => void };
      if (ws.readyState === WS_CONNECTING && typeof nodeWs.terminate === 'function') {
        nodeWs.terminate();
        return;
      }
      ws.close();
    } catch {
      // ignore
    }
  }

  private handleMessage(marketType: MarketType, data: unknown): void {
    let parsed: unknown;
    try {
      const text = typeof data === 'string' ? data : String(data);
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn('ws.invalid_json', { marketType });
      return;
    }

    if (!parsed || typeof parsed !== 'object') {
      return;
    }

    const obj = parsed as {
      stream?: string;
      data?: unknown;
      result?: unknown;
      id?: number;
      code?: number;
      msg?: string;
    };

    // Control ack / error responses
    if ('result' in obj || ('id' in obj && !('stream' in obj))) {
      if (obj.code != null) {
        this.logger.warn('ws.control_error', {
          marketType,
          code: obj.code,
          msg: obj.msg,
        });
        this.sink?.({
          type: 'error',
          payload: {
            code: String(obj.code),
            message: obj.msg ?? 'Binance WS control error',
            exchange: BINANCE_EXCHANGE_ID,
            marketType,
            retryable: true,
            ts: this.now(),
          },
        });
      }
      return;
    }

    const stream = obj.stream;
    const payload = obj.data ?? parsed;
    if (!stream) {
      return;
    }

    const set = this.handlers.get(marketType)?.get(stream);
    if (!set || set.size === 0) {
      return;
    }
    for (const handler of set) {
      handler.onMessage(payload);
    }
  }

  private async sendControl(
    marketType: MarketType,
    method: 'SUBSCRIBE' | 'UNSUBSCRIBE',
    params: string[],
  ): Promise<void> {
    if (params.length === 0) {
      return;
    }

    const prev =
      this.controlQueues.get(marketType) ?? Promise.resolve();
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        const ws = this.sockets.get(marketType);
        if (!ws || ws.readyState !== WS_OPEN) {
          return;
        }

        const elapsed =
          this.now() - (this.lastControlAt.get(marketType) ?? 0);
        if (elapsed < this.controlMinIntervalMs) {
          await new Promise((r) =>
            setTimeout(r, this.controlMinIntervalMs - elapsed),
          );
        }

        const id = this.nextRequestId++;
        ws.send(
          JSON.stringify({
            method,
            params,
            id,
          }),
        );
        this.lastControlAt.set(marketType, this.now());
        this.logger.debug('ws.control', { marketType, method, params, id });
      });

    this.controlQueues.set(marketType, next);
    await next;
  }

  private scheduleReconnect(marketType: MarketType): void {
    if (this.closed) {
      return;
    }
    this.clearReconnect(marketType);
    const attempt = this.reconnectAttempt.get(marketType) ?? 0;
    const delay =
      this.reconnectDelaysMs[
        Math.min(attempt, this.reconnectDelaysMs.length - 1)
      ] ?? 30_000;
    this.reconnectAttempt.set(marketType, attempt + 1);
    this.emitConnection(marketType, 'reconnecting');
    this.logger.info('ws.reconnect_scheduled', { marketType, delay, attempt });
    const timer = setTimeout(() => {
      this.reconnectTimers.delete(marketType);
      this.connect(marketType);
    }, delay);
    this.reconnectTimers.set(marketType, timer);
  }

  private clearReconnect(marketType: MarketType): void {
    const timer = this.reconnectTimers.get(marketType);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(marketType);
    }
  }

  private teardownSocket(marketType: MarketType, emitDisconnected: boolean): void {
    this.clearReconnect(marketType);
    this.connecting.delete(marketType);
    const ws = this.sockets.get(marketType);
    this.sockets.delete(marketType);
    if (ws) {
      this.safeClose(ws);
    }
    if (emitDisconnected) {
      this.emitConnection(marketType, 'disconnected');
    }
  }

  private isOpen(marketType: MarketType): boolean {
    const ws = this.sockets.get(marketType);
    return ws?.readyState === WS_OPEN;
  }

  private emitConnection(
    marketType: MarketType,
    state: ConnectionStatus['state'],
  ): void {
    this.sink?.({
      type: 'connection',
      payload: {
        exchange: BINANCE_EXCHANGE_ID,
        marketType,
        channel: 'market_stream',
        state,
        ts: this.now(),
      },
    });
  }
}
