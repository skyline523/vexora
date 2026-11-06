/** Binance spot list badge: cross-margin max leverage, e.g. 10x / 5x. */
export const BINANCE_MARGIN_PAIRS_URL =
  'https://www.binance.com/bapi/margin/v1/public/margin/pair/all';

interface MarginSide {
  marginRatio?: string;
  isMarginTrade?: boolean;
  status?: string;
}

interface MarginPairRow {
  symbol?: string;
  fullMargin?: MarginSide;
}

/**
 * Cross-margin leverage shown beside spot pairs on Binance.
 * Pairs that are not margin-tradable are omitted.
 */
export function parseMarginLeverage(payload: unknown): Record<string, number> {
  const rows = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(rows)) return {};

  const leverage: Record<string, number> = {};
  for (const row of rows as MarginPairRow[]) {
    const symbol = row.symbol?.toUpperCase();
    const margin = row.fullMargin;
    if (!symbol || !margin?.isMarginTrade) continue;
    if (margin.status && margin.status !== 'NORMAL') continue;
    const ratio = Number(margin.marginRatio);
    if (!Number.isFinite(ratio) || ratio < 1) continue;
    leverage[symbol] = Math.round(ratio);
  }
  return leverage;
}
