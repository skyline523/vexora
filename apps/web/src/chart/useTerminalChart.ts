import { useEffect, useRef, useState, type RefObject } from 'react';
import { createMarketChart, type ChartIndicator, type MarketChart } from '@vexora/chart-engine';
import type { Kline, KlineInterval } from '@vexora/shared';
import { fetchKlines, marketWebSocketUrl } from '../api/market';
import { useQuoteStore } from '../market/quotes';

export type StreamStatus = 'loading' | 'live' | 'reconnecting' | 'error';

interface StreamMessage {
  type?: string;
  payload?: unknown;
}

function readMessage(raw: string): StreamMessage | null {
  try {
    return JSON.parse(raw) as StreamMessage;
  } catch {
    return null;
  }
}

function isKline(value: unknown): value is Kline {
  if (!value || typeof value !== 'object') return false;
  const kline = value as Partial<Kline>;
  return typeof kline.openTime === 'number' && typeof kline.symbolId === 'string';
}

export function useTerminalChart(
  hostRef: RefObject<HTMLDivElement | null>,
  symbolId: string,
  interval: KlineInterval,
  indicators: readonly ChartIndicator[],
): { status: StreamStatus; error: string | null } {
  const chartRef = useRef<MarketChart | null>(null);
  const indicatorsRef = useRef(indicators);
  const historyRef = useRef<Kline[]>([]);
  const loadOlderRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<StreamStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  indicatorsRef.current = indicators;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const chart = createMarketChart(host, {
      indicators: indicatorsRef.current,
      onReachStart: () => loadOlderRef.current(),
    });
    chartRef.current = chart;
    if (historyRef.current.length > 0) {
      chart.setHistory(historyRef.current);
    }
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [hostRef]);

  useEffect(() => {
    chartRef.current?.setIndicators(indicators);
  }, [indicators]);

  useEffect(() => {
    let closed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;
    let ready = false;
    const pending: Kline[] = [];
    historyRef.current = [];
    chartRef.current?.setHistory([]);
    setStatus('loading');
    setError(null);

    const publishHistory = (rows: Kline[]): void => {
      historyRef.current = rows;
      chartRef.current?.setHistory(rows);
      ready = true;
      const queued = pending.splice(0);
      for (const kline of queued) {
        chartRef.current?.applyRealtime(kline);
      }
    };

    const loadInitial = async (): Promise<void> => {
      const rows = await fetchKlines({ symbolId, interval, limit: 500 });
      if (closed) return;
      publishHistory(rows);
      setStatus('live');
    };

    const connect = (): void => {
      const ws = new WebSocket(marketWebSocketUrl());
      socket = ws;
      ws.onopen = () => {
        if (closed) return;
        attempt = 0;
        ws.send(
          JSON.stringify({
            type: 'market.subscribe',
            requestId: crypto.randomUUID(),
            payload: { channel: 'kline', symbolId, interval },
          }),
        );
        if (ready) setStatus('live');
      };
      ws.onmessage = (event) => {
        const message = readMessage(String(event.data));
        if (!message || closed) return;
        if (message.type === 'market.kline' && isKline(message.payload)) {
          if (message.payload.symbolId !== symbolId || message.payload.interval !== interval)
            return;
          useQuoteStore.getState().applyLastPrice(message.payload.symbolId, message.payload.close);
          if (!ready) pending.push(message.payload);
          else chartRef.current?.applyRealtime(message.payload);
          return;
        }
        if (message.type === 'market.connection') {
          const state = (message.payload as { state?: string } | undefined)?.state;
          if (state === 'reconnecting' || state === 'disconnected') setStatus('reconnecting');
          if (state === 'connected' && ready) setStatus('live');
        }
        if (message.type === 'market.error') {
          const text =
            (message.payload as { message?: string } | undefined)?.message ?? 'Market stream error';
          setError(text);
          setStatus('error');
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('reconnecting');
        const delay = Math.min(10_000, 1000 * 2 ** attempt);
        attempt += 1;
        retry = setTimeout(connect, delay);
      };
    };

    let loadingOlder = false;
    let exhausted = false;
    loadOlderRef.current = () => {
      if (closed || loadingOlder || exhausted) return;
      const earliest = historyRef.current[0];
      if (!earliest) return;
      loadingOlder = true;
      void fetchKlines({
        symbolId,
        interval,
        limit: 300,
        endTime: earliest.openTime,
      })
        .then((rows) => {
          if (closed) return;
          const added = chartRef.current?.prependHistory(rows) ?? 0;
          historyRef.current = chartRef.current?.getCandles() ?? historyRef.current;
          if (rows.length === 0 || added === 0) exhausted = true;
        })
        .catch((cause: unknown) => {
          if (!closed) {
            setError(cause instanceof Error ? cause.message : 'Failed to load earlier klines');
          }
        })
        .finally(() => {
          loadingOlder = false;
        });
    };

    ping = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'sys.ping', payload: { ts: Date.now() } }));
      }
    }, 25_000);

    void loadInitial().catch((cause: unknown) => {
      if (closed) return;
      setStatus('error');
      setError(cause instanceof Error ? cause.message : 'Failed to load klines');
    });
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      if (ping) clearInterval(ping);
      socket?.close();
      loadOlderRef.current = () => undefined;
    };
  }, [symbolId, interval]);

  return { status, error };
}
