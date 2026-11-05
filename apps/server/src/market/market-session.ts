import {
  createMarketSymbol,
  parseSymbolId,
  type KlineInterval,
  type MarketEvent,
  type MarketSink,
  type MarketSymbol,
} from '@vexora/shared';
import type { EngineSubscription } from '@vexora/market-core';

export interface KlineStreamSource {
  subscribeKlines(
    symbol: MarketSymbol,
    interval: KlineInterval,
    listener?: MarketSink,
  ): EngineSubscription;
  subscribeTicker(symbol: MarketSymbol, listener?: MarketSink): EngineSubscription;
  switchKlines(
    subscription: Pick<EngineSubscription, 'id'>,
    next: { symbol: MarketSymbol; interval: KlineInterval },
  ): void;
  subscribeEvents(listener: MarketSink): () => void;
}

export interface SessionSocket {
  send(data: string): void;
}

interface ClientEnvelope {
  type?: unknown;
  requestId?: unknown;
  payload?: unknown;
}

const INTERVALS = new Set<KlineInterval>([
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '6h',
  '12h',
  '1d',
  '1w',
]);

function isInterval(value: string): value is KlineInterval {
  return INTERVALS.has(value as KlineInterval);
}

function symbolFromId(symbolId: string): MarketSymbol {
  return createMarketSymbol(parseSymbolId(symbolId));
}

/**
 * One browser socket. K-line subscribe uses the market engine refcount,
 * and close() releases that subscription.
 */
export class MarketClientSession {
  private klineSubscription: EngineSubscription | null = null;
  private readonly tickerSubscriptions = new Map<string, EngineSubscription>();
  private readonly stopEvents: () => void;
  private closed = false;

  constructor(
    private readonly source: KlineStreamSource,
    private readonly socket: SessionSocket,
  ) {
    this.stopEvents = source.subscribeEvents((event) => {
      if (event.type === 'connection') {
        this.send({ type: 'market.connection', payload: event.payload });
      } else if (event.type === 'error') {
        this.send({ type: 'market.error', payload: event.payload });
      }
    });
  }

  handleMessage(raw: string): void {
    if (this.closed) return;
    let message: ClientEnvelope;
    try {
      message = JSON.parse(raw) as ClientEnvelope;
    } catch {
      this.sendError('INVALID_MESSAGE', 'Malformed JSON', false);
      return;
    }

    const requestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    try {
      if (message.type === 'sys.ping') {
        this.send({ type: 'sys.pong', payload: { ts: Date.now() } });
        return;
      }
      if (message.type === 'market.subscribe') {
        this.subscribe(message.payload, requestId);
        return;
      }
      if (message.type === 'market.unsubscribe') {
        this.unsubscribe(message.payload, requestId);
        return;
      }
      this.sendError('UNSUPPORTED_MESSAGE', `Unsupported message type`, false, requestId);
    } catch (error) {
      this.sendError(
        'BAD_REQUEST',
        error instanceof Error ? error.message : 'Bad request',
        false,
        requestId,
      );
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.klineSubscription?.unsubscribe();
    this.klineSubscription = null;
    for (const subscription of this.tickerSubscriptions.values()) {
      subscription.unsubscribe();
    }
    this.tickerSubscriptions.clear();
    this.stopEvents();
  }

  private subscribe(payload: unknown, requestId: string | undefined): void {
    const body = asRecord(payload);
    const channel = body.channel;
    if (channel !== 'kline' && channel !== 'ticker') {
      throw new Error('Unsupported channel');
    }
    const symbolId = body.symbolId;
    if (typeof symbolId !== 'string') {
      throw new Error('symbolId is required');
    }
    const symbol = symbolFromId(symbolId);
    if (channel === 'ticker') {
      this.subscribeTicker(symbol, requestId);
      return;
    }
    const interval = body.interval;
    if (typeof interval !== 'string' || !isInterval(interval)) {
      throw new Error('symbolId and interval are required');
    }

    if (this.klineSubscription) {
      this.source.switchKlines(this.klineSubscription, { symbol, interval });
    } else {
      this.klineSubscription = this.source.subscribeKlines(symbol, interval, (event) => {
        this.forwardKline(event);
      });
    }

    this.send({
      type: 'market.subscribed',
      requestId,
      payload: {
        subscriptionId: this.klineSubscription.id,
        channel: 'kline',
        symbolId: symbol.symbolId,
        interval,
      },
    });
  }

  private subscribeTicker(symbol: MarketSymbol, requestId: string | undefined): void {
    let subscription = this.tickerSubscriptions.get(symbol.symbolId);
    if (!subscription) {
      subscription = this.source.subscribeTicker(symbol, (event) => {
        if (this.closed || event.type !== 'ticker') return;
        this.send({ type: 'market.ticker', payload: event.payload });
      });
      this.tickerSubscriptions.set(symbol.symbolId, subscription);
    }
    this.send({
      type: 'market.subscribed',
      requestId,
      payload: {
        subscriptionId: subscription.id,
        channel: 'ticker',
        symbolId: symbol.symbolId,
      },
    });
  }

  private unsubscribe(payload: unknown, requestId: string | undefined): void {
    const subscriptionId =
      payload && typeof payload === 'object' && 'subscriptionId' in payload
        ? String((payload as { subscriptionId?: unknown }).subscriptionId ?? '')
        : '';

    if (!subscriptionId || this.klineSubscription?.id === subscriptionId) {
      const id = this.klineSubscription?.id;
      this.klineSubscription?.unsubscribe();
      this.klineSubscription = null;
      this.send({ type: 'market.unsubscribed', requestId, payload: { subscriptionId: id } });
      return;
    }

    for (const [symbolId, subscription] of this.tickerSubscriptions) {
      if (subscription.id !== subscriptionId) continue;
      subscription.unsubscribe();
      this.tickerSubscriptions.delete(symbolId);
      this.send({ type: 'market.unsubscribed', requestId, payload: { subscriptionId } });
      return;
    }
  }

  private forwardKline(event: MarketEvent): void {
    if (this.closed) return;
    if (event.type === 'kline') {
      this.send({ type: 'market.kline', payload: event.payload });
      return;
    }
    if (event.type === 'gap_detected') {
      this.send({ type: 'market.gap', payload: event.payload });
    }
  }

  private send(message: unknown): void {
    if (this.closed) return;
    this.socket.send(JSON.stringify(message));
  }

  private sendError(code: string, message: string, retryable: boolean, requestId?: string): void {
    this.send({
      type: 'market.error',
      requestId,
      payload: {
        code,
        message,
        retryable,
        ts: Date.now(),
      },
    });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('payload is required');
  }
  return value as Record<string, unknown>;
}
