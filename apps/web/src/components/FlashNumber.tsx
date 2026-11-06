import { useEffect, useRef, useState } from 'react';
import styles from './FlashNumber.module.css';

/** `null` = flat / default text color (white). */
export type TickTone = 'up' | 'down' | null;

interface FlashNumberProps {
  value: number | null | undefined;
  text: string;
  className?: string;
}

/**
 * Display color is derived from the last change vs the previous shown value:
 * higher → green, lower → red, equal / first paint → white.
 * Color sticks until the next display-text change (no timed fade-back).
 */
export function useTickTone(value: number | null | undefined, text: string): TickTone {
  const previousText = useRef<string | undefined>(undefined);
  const previousValue = useRef<number | null | undefined>(undefined);
  const [tone, setTone] = useState<TickTone>(null);

  useEffect(() => {
    const lastText = previousText.current;
    const lastValue = previousValue.current;

    if (lastText === undefined) {
      previousText.current = text;
      previousValue.current = value;
      setTone(null);
      return;
    }

    // Same shown text → keep current color; only raw ticks that don't change digits.
    if (text === lastText) {
      previousValue.current = value;
      return;
    }

    previousText.current = text;
    previousValue.current = value;

    if (lastValue == null || value == null || !Number.isFinite(lastValue) || !Number.isFinite(value)) {
      setTone(null);
      return;
    }

    if (value > lastValue) setTone('up');
    else if (value < lastValue) setTone('down');
    else setTone(null);
  }, [text, value]);

  return tone;
}

/** @deprecated Use useTickTone */
export const useFlashTone = useTickTone;

export function tickToneClass(tone: TickTone): string {
  if (tone === 'up') return styles.up ?? '';
  if (tone === 'down') return styles.down ?? '';
  return '';
}

/** @deprecated Use tickToneClass */
export const flashToneClass = tickToneClass;

export function FlashNumber({ value, text, className }: FlashNumberProps) {
  const tone = useTickTone(value, text);
  return (
    <span className={[styles.root, className, tickToneClass(tone)].filter(Boolean).join(' ')}>
      {text}
    </span>
  );
}
