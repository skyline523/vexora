import { getInstrument } from '../data/mockMarket';
import { useTerminalStore } from '../store/terminalStore';
import styles from './ChartPanel.module.css';

export function ChartPanel() {
  const symbolId = useTerminalStore((state) => state.symbolId);
  const interval = useTerminalStore((state) => state.interval);
  const marketType = useTerminalStore((state) => state.marketType);
  const active = getInstrument(symbolId);

  return (
    <section className={styles.root} aria-label="Chart">
      <div className={styles.toolbar}>
        <h2 className={styles.title}>Chart</h2>
        <div className={styles.meta}>
          <span>{active?.symbol ?? '—'}</span>
          <span>{interval}</span>
          <span>{marketType === 'spot' ? 'Spot' : 'USDT-M'}</span>
        </div>
      </div>
      <div className={styles.canvas} data-chart-host="true">
        <svg className={styles.spark} viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden>
          <polyline
            fill="none"
            stroke="#3d8bfd"
            strokeWidth="1.2"
            points="0,28 8,24 16,30 24,18 32,22 40,14 48,20 56,12 64,16 72,10 80,15 88,8 100,12"
          />
          <polyline
            fill="none"
            stroke="#2fbf71"
            strokeOpacity="0.55"
            strokeWidth="1"
            points="0,34 10,32 20,33 30,29 40,31 50,27 60,28 70,24 80,26 90,22 100,23"
          />
        </svg>
        <div className={styles.placeholder}>
          <strong>K-line workspace</strong>
          <p>Chart engine mounts here in Task 05. Layout and symbol/interval controls are ready.</p>
        </div>
      </div>
    </section>
  );
}
