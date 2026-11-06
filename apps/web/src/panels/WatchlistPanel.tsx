import { Input } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlashQuote } from '../components/FlashQuote';
import { PanelHeader } from '../components/PanelHeader';
import { SymbolWithPerp } from '../components/SymbolWithPerp';
import { formatPercent, formatPrice, listedSymbol, listedTag, resolveWatchlistItems } from '../data/mockMarket';
import { useInstrumentSearch } from '../market/instrumentSearch';
import { useMarginLeverage } from '../market/marginLeverage';
import { useHydrateQuotes, useQuoteStore, useWatchlistQuotes } from '../market/quotes';
import { useTerminalStore } from '../store/terminalStore';
import type { MarketType } from '../types/terminal';
import styles from './WatchlistPanel.module.css';

function MarketTag({
  label,
  marketType,
  extra,
}: {
  label: string;
  marketType: MarketType;
  extra?: string;
}) {
  return (
    <span className={`${styles.tag} ${marketType === 'spot' ? styles.tagSpot : styles.tagPerp}`}>
      {label}
      {extra ? ` · ${extra}` : ''}
    </span>
  );
}

export function WatchlistPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const watchlistIds = useTerminalStore((state) => state.watchlistIds);
  const setSymbolId = useTerminalStore((state) => state.setSymbolId);
  const addToWatchlist = useTerminalStore((state) => state.addToWatchlist);
  const removeFromWatchlist = useTerminalStore((state) => state.removeFromWatchlist);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Show mixed Spot + Perp favorites with tags (Binance-style).
  const items = useMemo(() => resolveWatchlistItems(watchlistIds), [watchlistIds]);
  const quotes = useQuoteStore((state) => state.quotes);
  const marginLeverage = useMarginLeverage();

  const { results, loading, error } = useInstrumentSearch({
    query,
    enabled: open,
    limit: 12,
  });

  useWatchlistQuotes(items.map((item) => item.symbolId));
  useHydrateQuotes(open ? results.map((item) => item.symbolId) : []);

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
            placeholder="搜索现货 / 合约"
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
              {error && results.length > 0 ? <div className={styles.hint}>{error}</div> : null}
              {loading && results.length === 0 ? (
                <div className={styles.empty}>Searching markets…</div>
              ) : results.length === 0 ? (
                <div className={styles.empty}>
                  {error
                    ? `Search unavailable. ${error}`
                    : `No symbols match “${query.trim() || '…'}”`}
                </div>
              ) : (
                results.map((item) => {
                  const inList = watchlistIds.includes(item.symbolId);
                  const quote = quotes[item.symbolId];
                  const lastPrice = quote?.lastPrice ?? item.lastPrice;
                  const changePercent = quote?.changePercent ?? item.changePercent;
                  return (
                    <button
                      key={item.symbolId}
                      type="button"
                      role="option"
                      aria-selected={inList}
                      className={`${styles.result} ${inList ? styles.resultInList : ''}`}
                      onClick={() => {
                        if (inList) {
                          setSymbolId(item.symbolId);
                          setQuery('');
                          setOpen(false);
                          return;
                        }
                        addToWatchlist(item.symbolId);
                        setQuery('');
                        setOpen(false);
                      }}
                    >
                      <span className={styles.symbolCell}>
                        <SymbolWithPerp
                          name={listedSymbol(item)}
                          perpetual={item.marketType !== 'spot'}
                          nameClassName={styles.symbol}
                        />
                        {item.marketType === 'spot' && listedTag(item, marginLeverage) ? (
                          <MarketTag
                            marketType={item.marketType}
                            label={listedTag(item, marginLeverage)!}
                            extra={inList ? '已添加' : undefined}
                          />
                        ) : null}
                      </span>
                      <span className={styles.quoteCell}>
                        <FlashQuote
                          value={lastPrice}
                          valueText={lastPrice > 0 ? formatPrice(lastPrice) : '—'}
                          percentText={lastPrice > 0 ? formatPercent(changePercent) : ''}
                          valueClassName={styles.price}
                          percentClassName={styles.change}
                        />
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
          <li className={styles.emptyList}>还没有币种。搜索现货或合约后加入。</li>
        ) : (
          items.map((item) => {
            const active = item.symbolId === symbolId;
            const quote = quotes[item.symbolId];
            const lastPrice = quote?.lastPrice ?? item.lastPrice;
            const changePercent = quote?.changePercent ?? item.changePercent;
            return (
              <li key={item.symbolId} className={styles.row}>
                <button
                  type="button"
                  className={`${styles.item} ${active ? styles.itemActive : ''}`}
                  onClick={() => setSymbolId(item.symbolId)}
                >
                  <span className={styles.symbolCell}>
                    <SymbolWithPerp
                      name={listedSymbol(item)}
                      perpetual={item.marketType !== 'spot'}
                      nameClassName={styles.symbol}
                    />
                    {item.marketType === 'spot' && listedTag(item, marginLeverage) ? (
                      <MarketTag
                        marketType={item.marketType}
                        label={listedTag(item, marginLeverage)!}
                      />
                    ) : null}
                  </span>
                  <span className={styles.quoteCell}>
                    <FlashQuote
                      value={lastPrice}
                      valueText={lastPrice > 0 ? formatPrice(lastPrice) : '—'}
                      percentText={lastPrice > 0 ? formatPercent(changePercent) : '—'}
                      valueClassName={styles.price}
                      percentClassName={styles.change}
                    />
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
