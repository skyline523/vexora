import {
  KLINE_INTERVALS,
  createMarketSymbol,
  parseSymbolId,
  type GetKlinesParams,
  type KlineInterval,
} from '@vexora/shared';

export interface KlineQuery {
  symbolId?: string;
  interval?: string;
  limit?: string;
  startTime?: string;
  endTime?: string;
}

function isInterval(value: string): value is KlineInterval {
  return (KLINE_INTERVALS as readonly string[]).includes(value);
}

function optionalTime(value: string | undefined, name: string): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a timestamp in milliseconds`);
  }
  return parsed;
}

export function parseKlineQuery(query: KlineQuery): GetKlinesParams {
  if (!query.symbolId) {
    throw new Error('symbolId is required');
  }
  if (!query.interval || !isInterval(query.interval)) {
    throw new Error('interval is required');
  }

  let symbol;
  try {
    const parsed = parseSymbolId(query.symbolId);
    symbol = createMarketSymbol(parsed);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Invalid symbolId');
  }

  const startTime = optionalTime(query.startTime, 'startTime');
  const endTime = optionalTime(query.endTime, 'endTime');
  const limit = query.limit == null || query.limit === '' ? undefined : Number(query.limit);
  if (limit != null && (!Number.isFinite(limit) || limit < 1)) {
    throw new Error('limit must be a positive number');
  }

  return {
    symbol,
    interval: query.interval,
    ...(startTime != null ? { startTime } : {}),
    ...(endTime != null ? { endTime } : {}),
    ...(limit != null ? { limit: Math.floor(limit) } : {}),
  };
}
