import styles from './SymbolWithPerp.module.css';

export function SymbolWithPerp({
  name,
  perpetual,
  nameClassName,
}: {
  name: string;
  perpetual: boolean;
  nameClassName?: string;
}) {
  return (
    <span className={styles.line}>
      <span className={[styles.name, nameClassName].filter(Boolean).join(' ')}>{name}</span>
      {perpetual ? <span className={styles.perp}>永续</span> : null}
    </span>
  );
}
