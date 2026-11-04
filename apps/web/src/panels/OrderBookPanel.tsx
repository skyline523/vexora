import { PanelHeader } from '../components/PanelHeader';
import { buildOrderBook, formatPrice, formatQty, WATCHLIST } from '../data/mockMarket';
import { useTerminalStore } from '../store/terminalStore';
import styles from './OrderBookPanel.module.css';

export function OrderBookPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const active = WATCHLIST.find((item) => item.symbolId === symbolId) ?? WATCHLIST[0]!;
  const book = buildOrderBook(active.lastPrice);
  const bestAsk = book.asks[0]!;
  const bestBid = book.bids[0]!;
  const spread = bestAsk.price - bestBid.price;
  const maxQty = Math.max(
    ...book.asks.map((level) => level.quantity),
    ...book.bids.map((level) => level.quantity),
  );

  return (
    <section className={styles.root} aria-label="Order book">
      <PanelHeader title="Order Book" meta={active.symbol} />
      <div className={styles.table}>
        <div className={styles.head}>
          <span>Price</span>
          <span className={styles.qty}>Size</span>
          <span className={styles.total}>Total</span>
        </div>
        {[...book.asks].reverse().map((level) => (
          <div key={`a-${level.price}`} className={`${styles.row} ${styles.ask}`}>
            <span
              className={styles.bar}
              style={{ width: `${(level.quantity / maxQty) * 100}%` }}
            />
            <span className={styles.askPrice}>{formatPrice(level.price)}</span>
            <span className={styles.qty}>{formatQty(level.quantity)}</span>
            <span className={styles.total}>{formatQty(level.quantity * 1.8)}</span>
          </div>
        ))}
        <div className={styles.spread}>
          <span>Spread</span>
          <span>{formatPrice(spread)}</span>
        </div>
        {book.bids.map((level) => (
          <div key={`b-${level.price}`} className={`${styles.row} ${styles.bid}`}>
            <span
              className={styles.bar}
              style={{ width: `${(level.quantity / maxQty) * 100}%` }}
            />
            <span className={styles.bidPrice}>{formatPrice(level.price)}</span>
            <span className={styles.qty}>{formatQty(level.quantity)}</span>
            <span className={styles.total}>{formatQty(level.quantity * 1.6)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
