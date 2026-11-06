import { Select } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { PanelHeader } from '../components/PanelHeader';
import { SymbolWithPerp } from '../components/SymbolWithPerp';
import {
  formatQtyWithScale,
  getInstrument,
  listedSymbol,
  listedTag,
  MARKET_INSTRUMENTS,
  qtyScaleForMax,
} from '../data/mockMarket';
import { useMarginLeverage } from '../market/marginLeverage';
import {
  aggregateBookLevels,
  BOOK_SIDE_LEVELS,
  bookTickOptionsForPrice,
  defaultBookTick,
  formatBookPrice,
  formatTickLabel,
  useLiveBookStore,
  useLiveMarketFeed,
  withCumulativeTotals,
  type BookTick,
} from '../market/liveBook';
import { useTerminalStore } from '../store/terminalStore';
import styles from './OrderBookPanel.module.css';

export function OrderBookPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const active = getInstrument(symbolId) ?? MARKET_INSTRUMENTS[0]!;
  const marginLeverage = useMarginLeverage();
  const symbolLabel = listedSymbol(active);
  const symbolTag = listedTag(active, marginLeverage);
  useLiveMarketFeed(symbolId);

  const book = useLiveBookStore((state) => (state.symbolId === symbolId ? state.book : null));
  const midPrice = book?.asks[0]?.price ?? book?.bids[0]?.price ?? null;

  const tickOptions = useMemo(() => bookTickOptionsForPrice(midPrice), [midPrice]);
  const [tick, setTick] = useState<BookTick>(() => defaultBookTick(midPrice));

  useEffect(() => {
    setTick(defaultBookTick(midPrice));
  }, [symbolId]);

  useEffect(() => {
    if (!tickOptions.includes(tick)) {
      setTick(tickOptions[0]!);
    }
  }, [tick, tickOptions]);

  const asks = useMemo(
    () =>
      withCumulativeTotals(
        aggregateBookLevels(book?.asks ?? [], tick, 'ask', BOOK_SIDE_LEVELS),
      ),
    [book?.asks, tick],
  );
  const bids = useMemo(
    () =>
      withCumulativeTotals(
        aggregateBookLevels(book?.bids ?? [], tick, 'bid', BOOK_SIDE_LEVELS),
      ),
    [book?.bids, tick],
  );

  const bestAsk = asks[0];
  const bestBid = bids[0];
  const spread = bestAsk && bestBid ? bestAsk.price - bestBid.price : null;
  const maxQty = Math.max(
    0.0001,
    ...asks.map((level) => level.qty),
    ...bids.map((level) => level.qty),
  );
  // Scale from the largest visible size/total so BTC stays plain and meme coins compact.
  const qtyScale = qtyScaleForMax(
    Math.max(
      maxQty,
      ...asks.map((level) => level.total),
      ...bids.map((level) => level.total),
    ),
  );

  return (
    <section className={styles.root} aria-label="Order book">
      <PanelHeader
        title="Order Book"
        meta={
          <Select
            size="small"
            value={tick}
            className={styles.tickSelect}
            popupMatchSelectWidth={false}
            options={tickOptions.map((value) => ({
              value,
              label: formatTickLabel(value),
            }))}
            onChange={(value) => setTick(value as BookTick)}
            aria-label="Order book tick size"
          />
        }
      />
      <div className={styles.body}>
        <div className={styles.head}>
          <span>Price</span>
          <span className={styles.qty}>Size</span>
          <span className={styles.total}>Total</span>
        </div>

        {asks.length === 0 && bids.length === 0 ? (
          <div className={styles.empty}>Waiting for book…</div>
        ) : (
          <>
            <div className={styles.side}>
              {Array.from({ length: BOOK_SIDE_LEVELS }, (_, index) => {
                // Keep asks glued to the spread: pad empty rows above.
                const reversed = [...asks].reverse();
                const pad = BOOK_SIDE_LEVELS - reversed.length;
                const level = index < pad ? undefined : reversed[index - pad];
                if (!level) {
                  return <div key={`a-empty-${index}`} className={styles.row} />;
                }
                return (
                  <div key={`a-${level.price}`} className={`${styles.row} ${styles.ask}`}>
                    <span
                      className={styles.bar}
                      style={{ width: `${(level.qty / maxQty) * 100}%` }}
                    />
                    <span className={styles.askPrice}>{formatBookPrice(level.price, tick)}</span>
                    <span className={styles.qty}>{formatQtyWithScale(level.qty, qtyScale)}</span>
                    <span className={styles.total}>{formatQtyWithScale(level.total, qtyScale)}</span>
                  </div>
                );
              })}
            </div>

            <div className={styles.spread}>
              <SymbolWithPerp name={symbolLabel} perpetual={symbolTag === '永续'} />
              <span>{spread == null ? '—' : formatBookPrice(spread, tick)}</span>
            </div>

            <div className={styles.side}>
              {Array.from({ length: BOOK_SIDE_LEVELS }, (_, index) => {
                const level = bids[index];
                if (!level) {
                  return <div key={`b-empty-${index}`} className={styles.row} />;
                }
                return (
                  <div key={`b-${level.price}`} className={`${styles.row} ${styles.bid}`}>
                    <span
                      className={styles.bar}
                      style={{ width: `${(level.qty / maxQty) * 100}%` }}
                    />
                    <span className={styles.bidPrice}>{formatBookPrice(level.price, tick)}</span>
                    <span className={styles.qty}>{formatQtyWithScale(level.qty, qtyScale)}</span>
                    <span className={styles.total}>{formatQtyWithScale(level.total, qtyScale)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
