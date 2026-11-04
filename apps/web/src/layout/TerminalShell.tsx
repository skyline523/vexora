import { useCallback } from 'react';
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

  const onWatchlistChange = useCallback(
    (watchlist: number) => {
      setLayout({ watchlist });
    },
    [setLayout],
  );

  const onAiChange = useCallback(
    (ai: number) => {
      setLayout({ ai });
    },
    [setLayout],
  );

  const onBottomChange = useCallback(
    (bottom: number) => {
      setLayout({ bottom });
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
          <div className={styles.chart}>
            <ChartPanel />
          </div>
          <ResizeHandle
            axis="y"
            value={layout.bottom}
            invert
            onChange={onBottomChange}
            label="Resize bottom panels"
          />
          <div className={styles.bottom} style={{ height: layout.bottom }}>
            <OrderBookPanel />
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
