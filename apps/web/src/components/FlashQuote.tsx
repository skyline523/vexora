import type { ReactNode } from 'react';
import { tickToneClass, useTickTone } from './FlashNumber';
import styles from './FlashNumber.module.css';

interface FlashQuoteProps {
  value: number | null | undefined;
  valueText: string;
  percentText: string;
  valueClassName?: string;
  percentClassName?: string;
  between?: ReactNode;
}

/**
 * Price comparison drives the tone; percent uses the same lasting color.
 */
export function FlashQuote({
  value,
  valueText,
  percentText,
  valueClassName,
  percentClassName,
  between,
}: FlashQuoteProps) {
  const tone = useTickTone(value, valueText);
  const toneClass = tickToneClass(tone);

  return (
    <>
      <span className={[styles.root, valueClassName, toneClass].filter(Boolean).join(' ')}>
        {valueText}
      </span>
      {between}
      <span className={[styles.root, percentClassName, toneClass].filter(Boolean).join(' ')}>
        {percentText}
      </span>
    </>
  );
}
