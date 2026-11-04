import { Button, Input } from 'antd';
import { PanelHeader } from '../components/PanelHeader';
import styles from './AiPanel.module.css';

export function AiPanel() {
  return (
    <section className={styles.root} aria-label="AI assistant">
      <PanelHeader title="AI Assistant" meta="Phase 2" />
      <div className={styles.body}>
        <div className={styles.thread}>
          <div className={styles.bubble}>
            <p className={styles.bubbleRole}>System</p>
            <p className={styles.bubbleText}>
              AI analysis mounts here later. Ask about trend, indicators, or risk once providers are
              configured.
            </p>
          </div>
          <div className={styles.bubble}>
            <p className={styles.bubbleRole}>Example</p>
            <p className={styles.bubbleText}>
              “Summarize BTC/USDT 15m structure and key support levels.”
            </p>
          </div>
        </div>
        <p className={styles.hint}>Placeholder input — wiring arrives with Financial Agent.</p>
        <div className={styles.composer}>
          <Input placeholder="Ask about the current market…" disabled />
          <Button type="primary" disabled>
            Send
          </Button>
        </div>
      </div>
    </section>
  );
}
