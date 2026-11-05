import { useRef, useState } from 'react';
import { CHART_INDICATORS, type ChartIndicator } from '@vexora/chart-engine';
import { getInstrument } from '../data/mockMarket';
import { useTerminalChart, type StreamStatus } from '../chart/useTerminalChart';
import { useTerminalStore } from '../store/terminalStore';
import styles from './ChartPanel.module.css';

const INDICATOR_LABEL: Record<ChartIndicator, string> = {
  ma: 'MA',
  ema: 'EMA',
  macd: 'MACD',
  rsi: 'RSI',
};

const STATUS_LABEL: Record<StreamStatus, string> = {
  loading: 'Loading',
  live: 'Live',
  reconnecting: 'Reconnecting',
  error: 'Error',
};

function statusClass(status: StreamStatus): string {
  if (status === 'live') return styles.live ?? '';
  if (status === 'error') return styles.errorStatus ?? '';
  if (status === 'reconnecting') return styles.reconnecting ?? '';
  return styles.loading ?? '';
}

function toggleIndicator(
  current: readonly ChartIndicator[],
  indicator: ChartIndicator,
): ChartIndicator[] {
  if (current.includes(indicator)) {
    return current.filter((item) => item !== indicator);
  }
  return CHART_INDICATORS.filter((item) => item === indicator || current.includes(item));
}

export function ChartPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const interval = useTerminalStore((state) => state.interval);
  const marketType = useTerminalStore((state) => state.marketType);
  const hostRef = useRef<HTMLDivElement>(null);
  const [indicators, setIndicators] = useState<ChartIndicator[]>([]);
  const { status, error } = useTerminalChart(hostRef, symbolId, interval, indicators);
  const active = getInstrument(symbolId);

  return (
    <section className={styles.root} aria-label="Chart">
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Chart</h2>
        <div className={styles.meta}>
          <span>{active?.symbol ?? '—'}</span>
          <span>{interval}</span>
          <span>{marketType === 'spot' ? 'Spot' : 'USDT-M'}</span>
          <span className={statusClass(status)} data-chart-status={status}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className={styles.indicators} role="group" aria-label="Indicators">
          {CHART_INDICATORS.map((indicator) => {
            const pressed = indicators.includes(indicator);
            return (
              <button
                key={indicator}
                type="button"
                className={pressed ? styles.indicatorOn : styles.indicator}
                aria-pressed={pressed}
                onClick={() => setIndicators((current) => toggleIndicator(current, indicator))}
              >
                {INDICATOR_LABEL[indicator]}
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.canvas}>
        <div ref={hostRef} className={styles.host} aria-label="Price chart" />
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </section>
  );
}
