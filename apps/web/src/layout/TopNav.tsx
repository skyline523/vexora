import { Segmented, Select } from 'antd';
import {
  formatPercent,
  formatPrice,
  INTERVAL_OPTIONS,
  MARKET_TYPE_OPTIONS,
  WATCHLIST,
} from '../data/mockMarket';
import { useTerminalStore } from '../store/terminalStore';
import type { KlineInterval, MarketType } from '../types/terminal';
import styles from './TopNav.module.css';

export function TopNav() {
  const marketType = useTerminalStore((state) => state.marketType);
  const symbolId = useTerminalStore((state) => state.symbolId);
  const interval = useTerminalStore((state) => state.interval);
  const setMarketType = useTerminalStore((state) => state.setMarketType);
  const setSymbolId = useTerminalStore((state) => state.setSymbolId);
  const setInterval = useTerminalStore((state) => state.setInterval);

  const symbols = WATCHLIST.filter((item) => item.marketType === marketType);
  const active = WATCHLIST.find((item) => item.symbolId === symbolId) ?? symbols[0];
  const changeClass = (active?.changePercent ?? 0) >= 0 ? styles.up : styles.down;

  return (
    <header className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.brandName}>Vexora</span>
        <span className={styles.brandMark}>Terminal</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.group}>
          <span className={styles.label}>Market</span>
          <Segmented
            size="small"
            value={marketType}
            options={MARKET_TYPE_OPTIONS}
            onChange={(value) => setMarketType(value as MarketType)}
          />
        </div>

        <div className={styles.group}>
          <span className={styles.label}>Symbol</span>
          <Select
            style={{ minWidth: 140 }}
            value={symbolId}
            options={symbols.map((item) => ({
              label: item.symbol,
              value: item.symbolId,
            }))}
            onChange={setSymbolId}
          />
        </div>

        <div className={styles.group}>
          <span className={styles.label}>Interval</span>
          <Segmented
            size="small"
            value={interval}
            options={INTERVAL_OPTIONS}
            onChange={(value) => setInterval(value as KlineInterval)}
          />
        </div>
      </div>

      {active ? (
        <div className={styles.priceBlock}>
          <span className={styles.price}>{formatPrice(active.lastPrice)}</span>
          <span className={changeClass}>{formatPercent(active.changePercent)}</span>
        </div>
      ) : null}
    </header>
  );
}
