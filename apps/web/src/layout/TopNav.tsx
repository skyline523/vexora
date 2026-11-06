import { Segmented, Select } from 'antd';
import { FlashQuote } from '../components/FlashQuote';
import {
  formatPercent,
  formatPrice,
  getInstrument,
  INTERVAL_OPTIONS,
  MARKET_TYPE_OPTIONS,
  resolveWatchlistItems,
} from '../data/mockMarket';
import { useQuoteStore } from '../market/quotes';
import { useTerminalStore } from '../store/terminalStore';
import type { KlineInterval, MarketType } from '../types/terminal';
import styles from './TopNav.module.css';

export function TopNav() {
  const marketType = useTerminalStore((state) => state.marketType);
  const symbolId = useTerminalStore((state) => state.symbolId);
  const interval = useTerminalStore((state) => state.interval);
  const watchlistIds = useTerminalStore((state) => state.watchlistIds);
  const setMarketType = useTerminalStore((state) => state.setMarketType);
  const setSymbolId = useTerminalStore((state) => state.setSymbolId);
  const setInterval = useTerminalStore((state) => state.setInterval);

  const symbols = resolveWatchlistItems(watchlistIds).filter(
    (item) => item.marketType === marketType,
  );
  const active = getInstrument(symbolId) ?? symbols[0];
  const quote = useQuoteStore((state) => (active ? state.quotes[active.symbolId] : undefined));
  const lastPrice = quote?.lastPrice ?? active?.lastPrice;
  const changePercent = quote?.changePercent ?? active?.changePercent ?? 0;

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
        <div className={styles.priceBlock} key={active.symbolId}>
          <FlashQuote
            value={lastPrice ?? null}
            valueText={lastPrice == null ? '—' : formatPrice(lastPrice)}
            percentText={formatPercent(changePercent)}
            valueClassName={styles.price}
          />
        </div>
      ) : null}
    </header>
  );
}
