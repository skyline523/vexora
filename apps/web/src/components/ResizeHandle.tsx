import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './ResizeHandle.module.css';

interface ResizeHandleProps {
  axis: 'x' | 'y';
  /** Size being resized (px). Captured at pointerdown as the drag origin. */
  value: number;
  onChange: (next: number) => void;
  /** Dragging in the positive axis direction decreases the size. */
  invert?: boolean;
  label: string;
}

export function ResizeHandle({
  axis,
  value,
  onChange,
  invert = false,
  label,
}: ResizeHandleProps) {
  const [active, setActive] = useState(false);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const startPos = axis === 'x' ? event.clientX : event.clientY;
      const startValue = value;
      setActive(true);

      const onMove = (moveEvent: PointerEvent) => {
        const current = axis === 'x' ? moveEvent.clientX : moveEvent.clientY;
        const delta = current - startPos;
        onChange(invert ? startValue - delta : startValue + delta);
      };

      const onUp = (upEvent: PointerEvent) => {
        if (target.hasPointerCapture(upEvent.pointerId)) {
          target.releasePointerCapture(upEvent.pointerId);
        }
        setActive(false);
        target.removeEventListener('pointermove', onMove);
        target.removeEventListener('pointerup', onUp);
        target.removeEventListener('pointercancel', onUp);
      };

      target.addEventListener('pointermove', onMove);
      target.addEventListener('pointerup', onUp);
      target.addEventListener('pointercancel', onUp);
    },
    [axis, invert, onChange, value],
  );

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      data-active={active ? 'true' : 'false'}
      className={`${styles.handle} ${axis === 'x' ? styles.vertical : styles.horizontal}`}
      onPointerDown={onPointerDown}
    />
  );
}
