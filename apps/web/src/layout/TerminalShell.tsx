import { useCallback, useEffect } from 'react';
import { ResizeHandle } from '../components/ResizeHandle';
import { AiPanel } from '../panels/AiPanel';
import { ChartPanel } from '../panels/ChartPanel';
import { OrderBookPanel } from '../panels/OrderBookPanel';
import { TradesPanel } from '../panels/TradesPanel';
import { WatchlistPanel } from '../panels/WatchlistPanel';
import { useTerminalStore } from '../store/terminalStore';
import { TopNav } from './TopNav';
import styles from './TerminalShell.module.css';

export function TerminalShell() {
  const layout = useTerminalStore((state) => state.layout);
  const setLayout = useTerminalStore((state) => state.setLayout);
  const hydrateWatchlistFromServer = useTerminalStore((state) => state.hydrateWatchlistFromServer);

  useEffect(() => {
    void hydrateWatchlistFromServer();
  }, [hydrateWatchlistFromServer]);

  const onWatchlistChange = useCallback(
    (watchlist: number) => {
      setLayout({ watchlist });
    },
    [setLayout],
  );

  const onMarketChange = useCallback(
    (market: number) => {
      setLayout({ market });
    },
    [setLayout],
  );

  const onAiChange = useCallback(
    (ai: number) => {
      setLayout({ ai });
    },
    [setLayout],
  );

  return (
    <div className={styles.shell}>
      <TopNav />
      <div className={styles.body}>
        <div className={styles.watchlist} style={{ width: layout.watchlist }}>
          <WatchlistPanel />
        </div>
        <ResizeHandle
          axis="x"
          value={layout.watchlist}
          onChange={onWatchlistChange}
          label="Resize watchlist"
        />

        <div className={styles.center}>
          <ChartPanel />
        </div>

        <ResizeHandle
          axis="x"
          value={layout.market}
          invert
          onChange={onMarketChange}
          label="Resize market panels"
        />

        <div className={styles.market} style={{ width: layout.market }}>
          <div className={styles.marketBook}>
            <OrderBookPanel />
          </div>
          <div className={styles.marketTrades}>
            <TradesPanel />
          </div>
        </div>

        <ResizeHandle
          axis="x"
          value={layout.ai}
          invert
          onChange={onAiChange}
          label="Resize AI panel"
        />
        <div className={styles.ai} style={{ width: layout.ai }}>
          <AiPanel />
        </div>
      </div>
    </div>
  );
}
