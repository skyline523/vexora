const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

function toSubscript(value: number): string {
  return String(Math.trunc(Math.abs(value)))
    .split('')
    .map((digit) => SUBSCRIPT_DIGITS[Number(digit)] ?? digit)
    .join('');
}

/**
 * Decimal places for axes / tick sizes.
 * Tuned so meme-coin prices keep several significant digits (e.g. PEPE ≈ 8–10 dp).
 */
export function inferPriceDecimals(price: number): number {
  const abs = Math.abs(price);
  if (!Number.isFinite(abs) || abs === 0) return 2;
  if (abs >= 1000) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 6;
  const exp = Math.floor(Math.log10(abs));
  return Math.min(12, Math.max(6, -exp + 3));
}

export function inferPriceMinMove(price: number): number {
  const decimals = inferPriceDecimals(price);
  return Number((10 ** -decimals).toPrecision(12));
}

export interface PriceFormatOptions {
  /** Use Binance-style 0.0₄123 for very small prices. Default true. */
  subscriptZeros?: boolean;
}

/**
 * Exchange-style price text for UI (nav, watchlist, trades, legend).
 * Tiny prices use leading-zero subscripts when there are ≥4 zeros after the point.
 */
export function formatMarketPrice(value: number, options: PriceFormatOptions = {}): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0.00';

  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const useSubscript = options.subscriptZeros !== false;

  if (abs >= 1000) {
    return (
      sign +
      abs.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      })
    );
  }
  if (abs >= 1) {
    return (
      sign +
      abs.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })
    );
  }
  if (abs >= 0.01) {
    return (
      sign +
      abs.toLocaleString('en-US', {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      })
    );
  }

  const decimals = inferPriceDecimals(abs);
  const plain = abs.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '');
  const match = plain.match(/^0\.(0+)([1-9]\d*)$/);
  if (useSubscript && match && match[1]!.length >= 4) {
    return `${sign}0.0${toSubscript(match[1]!.length)}${match[2]}`;
  }
  return `${sign}${plain}`;
}
