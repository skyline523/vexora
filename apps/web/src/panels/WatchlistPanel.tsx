import { PanelHeader } from '../components/PanelHeader';
import { formatPercent, formatPrice, WATCHLIST } from '../data/mockMarket';
import { useTerminalStore } from '../store/terminalStore';
import styles from './WatchlistPanel.module.css';

export function WatchlistPanel() {
  const marketType = useTerminalStore((state) => state.marketType);
  const symbolId = useTerminalStore((state) => state.symbolId);
  const setSymbolId = useTerminalStore((state) => state.setSymbolId);

  const items = WATCHLIST.filter((item) => item.marketType === marketType);

  return (
    <section className={styles.root} aria-label="Watchlist">
      <PanelHeader title="Watchlist" meta={`${items.length}`} />
      <ul className={styles.list}>
        {items.map((item) => {
          const active = item.symbolId === symbolId;
          const changeClass = item.changePercent >= 0 ? styles.up : styles.down;
          return (
            <li key={item.symbolId}>
              <button
                type="button"
                className={`${styles.item} ${active ? styles.itemActive : ''}`}
                onClick={() => setSymbolId(item.symbolId)}
              >
                <span className={styles.symbol}>{item.symbol}</span>
                <span className={`${styles.price} ${changeClass}`}>
                  {formatPrice(item.lastPrice)}
                </span>
                <span className={styles.market}>
                  {item.marketType === 'spot' ? 'Spot' : 'Perp'}
                </span>
                <span className={`${styles.change} ${changeClass}`}>
                  {formatPercent(item.changePercent)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
