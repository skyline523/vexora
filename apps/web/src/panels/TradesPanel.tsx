import { useEffect, useRef, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader';
import { formatPrice, formatQty, getInstrument, MARKET_INSTRUMENTS } from '../data/mockMarket';
import { formatTradeTime, useLiveBookStore, useLiveMarketFeed } from '../market/liveBook';
import { useTerminalStore } from '../store/terminalStore';
import styles from './TradesPanel.module.css';

const ROW_HEIGHT = 26;
const DEFAULT_VISIBLE = 14;

export function TradesPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const active = getInstrument(symbolId) ?? MARKET_INSTRUMENTS[0]!;
  useLiveMarketFeed(symbolId);

  const listRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);

  useEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;
    const measure = () => {
      const next = Math.max(1, Math.floor(node.clientHeight / ROW_HEIGHT));
      setVisible(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const trades = useLiveBookStore((state) => (state.symbolId === symbolId ? state.trades : []));
  // Newest first; only keep what fits — older rows are overwritten off-screen.
  const rows = [...trades].reverse().slice(0, visible);

  return (
    <section className={styles.root} aria-label="Recent trades">
      <PanelHeader title="Trades" meta={active.symbol} />
      <div className={styles.body}>
        <div className={styles.head}>
          <span>Price</span>
          <span className={styles.qty}>Size</span>
          <span className={styles.time}>Time</span>
        </div>
        <div className={styles.list} ref={listRef}>
          {rows.length === 0 ? (
            <div className={styles.empty}>Waiting for trades…</div>
          ) : (
            rows.map((trade) => {
              const sideClass =
                trade.side === 'buy' ? styles.buy : trade.side === 'sell' ? styles.sell : undefined;
              return (
                <div key={trade.tradeId} className={styles.row}>
                  <span className={sideClass}>{formatPrice(trade.price)}</span>
                  <span className={styles.qty}>{formatQty(trade.qty)}</span>
                  <span className={styles.time}>{formatTradeTime(trade.ts)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
