import { Input } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader';
import {
  formatPercent,
  formatPrice,
  resolveWatchlistItems,
  searchInstruments,
} from '../data/mockMarket';
import { useQuoteStore, useWatchlistQuotes } from '../market/quotes';
import { useTerminalStore } from '../store/terminalStore';
import styles from './WatchlistPanel.module.css';

export function WatchlistPanel() {
  const marketType = useTerminalStore((state) => state.marketType);
  const symbolId = useTerminalStore((state) => state.symbolId);
  const watchlistIds = useTerminalStore((state) => state.watchlistIds);
  const setSymbolId = useTerminalStore((state) => state.setSymbolId);
  const addToWatchlist = useTerminalStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useTerminalStore((state) => state.removeFromWatchlist);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const items = useMemo(
    () => resolveWatchlistItems(watchlistIds).filter((item) => item.marketType === marketType),
    [watchlistIds, marketType],
  );
  const quotes = useQuoteStore((state) => state.quotes);
  useWatchlistQuotes(items.map((item) => item.symbolId));

  const results = useMemo(
    () => searchInstruments(query, { marketType, limit: 8 }),
    [query, marketType],
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <section className={styles.root} aria-label="Watchlist">
      <PanelHeader title="Watchlist" meta={`${items.length}`} />

      <div className={styles.search} ref={searchRef}>
        <div className={`${styles.searchField} ${open ? styles.searchFieldOpen : ''}`}>
          <Input
            allowClear
            size="small"
            value={query}
            placeholder="Search symbol…"
            aria-label="Search symbols"
            aria-expanded={open}
            aria-controls="watchlist-search-results"
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setOpen(false);
              }
            }}
          />

          {open ? (
            <div
              id="watchlist-search-results"
              className={styles.dropdown}
              role="listbox"
              aria-label="Search results"
            >
              {results.length === 0 ? (
                <div className={styles.empty}>No symbols match “{query.trim()}”</div>
              ) : (
                results.map((item) => {
                  const inList = watchlistIds.includes(item.symbolId);
                  const quote = quotes[item.symbolId];
                  const lastPrice = quote?.lastPrice ?? item.lastPrice;
                  const changePercent = quote?.changePercent ?? item.changePercent;
                  const changeClass = changePercent >= 0 ? styles.up : styles.down;
                  return (
                    <button
                      key={item.symbolId}
                      type="button"
                      role="option"
                      aria-selected={inList}
                      aria-disabled={inList}
                      className={`${styles.result} ${inList ? styles.resultInList : ''}`}
                      onClick={() => {
                        if (inList) {
                          return;
                        }
                        addToWatchlist(item.symbolId);
                        setQuery('');
                        setOpen(false);
                      }}
                    >
                      <span className={styles.symbol}>{item.symbol}</span>
                      <span className={`${styles.price} ${changeClass}`}>
                        {formatPrice(lastPrice)}
                      </span>
                      <span className={styles.market}>
                        {item.marketType === 'spot' ? 'Spot' : 'Perp'}
                      </span>
                      <span className={`${styles.change} ${changeClass}`}>
                        {formatPercent(changePercent)}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>

      <ul className={styles.list}>
        {items.length === 0 ? (
          <li className={styles.emptyList}>No symbols in this market. Search to add one.</li>
        ) : (
          items.map((item) => {
            const active = item.symbolId === symbolId;
            const quote = quotes[item.symbolId];
            const lastPrice = quote?.lastPrice ?? item.lastPrice;
            const changePercent = quote?.changePercent ?? item.changePercent;
            const changeClass = changePercent >= 0 ? styles.up : styles.down;
            return (
              <li key={item.symbolId} className={styles.row}>
                <button
                  type="button"
                  className={`${styles.item} ${active ? styles.itemActive : ''}`}
                  onClick={() => setSymbolId(item.symbolId)}
                >
                  <span className={styles.symbol}>{item.symbol}</span>
                  <span className={`${styles.price} ${changeClass}`}>
                    {formatPrice(lastPrice)}
                  </span>
                  <span className={styles.market}>
                    {item.marketType === 'spot' ? 'Spot' : 'Perp'}
                  </span>
                  <span className={`${styles.change} ${changeClass}`}>
                    {formatPercent(changePercent)}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${item.symbol}`}
                  title="Remove from watchlist"
                  disabled={watchlistIds.length <= 1}
                  onClick={() => removeFromWatchlist(item.symbolId)}
                >
                  ×
                </button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
