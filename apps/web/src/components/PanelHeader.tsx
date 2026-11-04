import type { ReactNode } from 'react';
import styles from './PanelHeader.module.css';

interface PanelHeaderProps {
  title: string;
  meta?: ReactNode;
}

export function PanelHeader({ title, meta }: PanelHeaderProps) {
  return (
    <header className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {meta ? <div className={styles.meta}>{meta}</div> : null}
    </header>
  );
}
