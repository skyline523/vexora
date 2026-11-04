import { PanelHeader } from '../components/PanelHeader';
import { buildTrades, formatPrice, formatQty, WATCHLIST } from '../data/mockMarket';
import { useTerminalStore } from '../store/terminalStore';
import styles from './TradesPanel.module.css';

export function TradesPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const active = WATCHLIST.find((item) => item.symbolId === symbolId) ?? WATCHLIST[0]!;
  const trades = buildTrades(active.lastPrice);

  return (
    <section className={styles.root} aria-label="Recent trades">
      <PanelHeader title="Trades" meta="Live later" />
      <div className={styles.table}>
        <div className={styles.head}>
          <span>Price</span>
          <span className={styles.qty}>Size</span>
          <span className={styles.time}>Time</span>
        </div>
        {trades.map((trade) => (
          <div key={trade.id} className={styles.row}>
            <span className={trade.side === 'buy' ? styles.buy : styles.sell}>
              {formatPrice(trade.price)}
            </span>
            <span className={styles.qty}>{formatQty(trade.quantity)}</span>
            <span className={styles.time}>{trade.time}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
