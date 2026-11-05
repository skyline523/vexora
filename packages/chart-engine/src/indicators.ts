export const MA_PERIOD = 20;
export const EMA_PERIOD = 20;
export const MACD_FAST = 12;
export const MACD_SLOW = 26;
export const MACD_SIGNAL = 9;
export const RSI_PERIOD = 14;

export interface StudyPoint {
  openTime: number;
  value: number;
}

export interface MacdSeries {
  macd: StudyPoint[];
  signal: StudyPoint[];
  histogram: StudyPoint[];
}

export function simpleMovingAverage(
  values: readonly number[],
  period: number,
): Array<number | null> {
  const result: Array<number | null> = values.map(() => null);
  if (period < 1) return result;

  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0;
    if (index >= period) {
      sum -= values[index - period] ?? 0;
    }
    if (index >= period - 1) {
      result[index] = sum / period;
    }
  }
  return result;
}

export function exponentialMovingAverage(
  values: readonly number[],
  period: number,
): Array<number | null> {
  const result: Array<number | null> = values.map(() => null);
  if (period < 1 || values.length < period) return result;

  let sum = 0;
  for (let index = 0; index < period; index += 1) {
    sum += values[index] ?? 0;
  }
  let ema = sum / period;
  result[period - 1] = ema;
  const weight = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    const price = values[index] ?? ema;
    ema = (price - ema) * weight + ema;
    result[index] = ema;
  }
  return result;
}

export function relativeStrengthIndex(
  values: readonly number[],
  period: number,
): Array<number | null> {
  const result: Array<number | null> = values.map(() => null);
  if (period < 1 || values.length <= period) return result;

  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const diff = (values[index] ?? 0) - (values[index - 1] ?? 0);
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;
  result[period] = rsiValue(avgGain, avgLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const diff = (values[index] ?? 0) - (values[index - 1] ?? 0);
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    result[index] = rsiValue(avgGain, avgLoss);
  }
  return result;
}

export function movingAverageConvergenceDivergence(
  values: readonly number[],
  fast = MACD_FAST,
  slow = MACD_SLOW,
  signalPeriod = MACD_SIGNAL,
): Array<{ macd: number | null; signal: number | null; histogram: number | null }> {
  const fastEma = exponentialMovingAverage(values, fast);
  const slowEma = exponentialMovingAverage(values, slow);
  const macdLine = values.map((_, index) => {
    const fastValue = fastEma[index];
    const slowValue = slowEma[index];
    if (fastValue == null || slowValue == null) return null;
    return fastValue - slowValue;
  });

  const defined: number[] = [];
  const indexes: number[] = [];
  for (let index = 0; index < macdLine.length; index += 1) {
    const value = macdLine[index];
    if (value == null) continue;
    defined.push(value);
    indexes.push(index);
  }
  const signalLine = exponentialMovingAverage(defined, signalPeriod);
  const result = macdLine.map((value) => ({
    macd: value,
    signal: null as number | null,
    histogram: null as number | null,
  }));

  for (let index = 0; index < indexes.length; index += 1) {
    const sourceIndex = indexes[index];
    const signal = signalLine[index];
    if (sourceIndex == null || signal == null) continue;
    const macdValue = macdLine[sourceIndex];
    if (macdValue == null) continue;
    result[sourceIndex] = {
      macd: macdValue,
      signal,
      histogram: macdValue - signal,
    };
  }
  return result;
}

function rsiValue(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const relative = avgGain / avgLoss;
  return 100 - 100 / (1 + relative);
}

export function studyPoints(
  openTimes: readonly number[],
  values: readonly (number | null)[],
): StudyPoint[] {
  const points: StudyPoint[] = [];
  for (let index = 0; index < openTimes.length; index += 1) {
    const openTime = openTimes[index];
    const value = values[index];
    if (openTime == null || value == null) continue;
    points.push({ openTime, value });
  }
  return points;
}
