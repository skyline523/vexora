import type { Kline } from '@vexora/shared';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type CandlestickData,
  type HistogramData,
  type ISeriesApi,
  type LineData,
  type LogicalRange,
  type SeriesType,
  type UTCTimestamp,
} from 'lightweight-charts';
import { animationFrameScheduler, RealtimeCoalescer } from './coalesce';
import {
  EMA_PERIOD,
  MA_PERIOD,
  MACD_FAST,
  MACD_SIGNAL,
  MACD_SLOW,
  RSI_PERIOD,
  exponentialMovingAverage,
  movingAverageConvergenceDivergence,
  relativeStrengthIndex,
  simpleMovingAverage,
  studyPoints,
  type StudyPoint,
} from './indicators';
import { KlineSeriesBuffer } from './series-buffer';

export const CHART_INDICATORS = ['ma', 'ema', 'macd', 'rsi'] as const;
export type ChartIndicator = (typeof CHART_INDICATORS)[number];

export interface MarketChart {
  setHistory(klines: readonly Kline[]): void;
  prependHistory(klines: readonly Kline[]): number;
  applyRealtime(kline: Kline): void;
  setIndicators(indicators: readonly ChartIndicator[]): void;
  getCandles(): Kline[];
  destroy(): void;
}

export interface MarketChartOptions {
  onReachStart?: () => void;
  indicators?: readonly ChartIndicator[];
}

const THEME = {
  background: '#0d131b',
  text: '#9aabc2',
  grid: '#1a2533',
  border: '#223044',
  up: '#2fbf71',
  down: '#ef5b5b',
  ma: '#e6b450',
  ema: '#3d8bfd',
  macd: '#7eb6ff',
  signal: '#e6b450',
  rsi: '#c084fc',
  volumeUp: 'rgba(47, 191, 113, 0.45)',
  volumeDown: 'rgba(239, 91, 91, 0.45)',
  crosshair: '#6e829b',
  label: '#1d2a3b',
};

const INDICATOR_ORDER: ChartIndicator[] = ['ma', 'ema', 'macd', 'rsi'];

function toTime(openTime: number): UTCTimestamp {
  return Math.floor(openTime / 1000) as UTCTimestamp;
}

function toCandle(kline: Kline): CandlestickData {
  return {
    time: toTime(kline.openTime),
    open: kline.open,
    high: kline.high,
    low: kline.low,
    close: kline.close,
  };
}

function toVolume(kline: Kline): HistogramData {
  return {
    time: toTime(kline.openTime),
    value: kline.volume,
    color: kline.close >= kline.open ? THEME.volumeUp : THEME.volumeDown,
  };
}

function toLine(points: readonly StudyPoint[]): LineData[] {
  return points.map((point) => ({ time: toTime(point.openTime), value: point.value }));
}

function toHistogram(points: readonly StudyPoint[]): HistogramData[] {
  return points.map((point) => ({
    time: toTime(point.openTime),
    value: point.value,
    color: point.value >= 0 ? THEME.volumeUp : THEME.volumeDown,
  }));
}

function normalizeIndicators(indicators: readonly ChartIndicator[]): ChartIndicator[] {
  const selected = new Set(indicators);
  return INDICATOR_ORDER.filter((indicator) => selected.has(indicator));
}

export function createMarketChart(
  container: HTMLElement,
  options: MarketChartOptions = {},
): MarketChart {
  const chart = createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: THEME.background },
      textColor: THEME.text,
      fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: THEME.grid },
      horzLines: { color: THEME.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: THEME.crosshair, labelBackgroundColor: THEME.label },
      horzLine: { color: THEME.crosshair, labelBackgroundColor: THEME.label },
    },
    rightPriceScale: { borderColor: THEME.border },
    timeScale: {
      borderColor: THEME.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 6,
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      horzTouchDrag: true,
      vertTouchDrag: false,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  });

  const candles = chart.addSeries(CandlestickSeries, {
    upColor: THEME.up,
    downColor: THEME.down,
    borderUpColor: THEME.up,
    borderDownColor: THEME.down,
    wickUpColor: THEME.up,
    wickDownColor: THEME.down,
    priceLineVisible: true,
    lastValueVisible: true,
  });
  candles.priceScale().applyOptions({
    scaleMargins: { top: 0.08, bottom: 0.28 },
  });

  const volume = chart.addSeries(HistogramSeries, {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    priceLineVisible: false,
    lastValueVisible: false,
  });
  volume.priceScale().applyOptions({
    scaleMargins: { top: 0.78, bottom: 0 },
  });

  const buffer = new KlineSeriesBuffer();
  const studies = new Map<string, ISeriesApi<SeriesType>>();
  let active = normalizeIndicators(options.indicators ?? []);

  const paintCandles = (): void => {
    const rows = buffer.getAll();
    candles.setData(rows.map(toCandle));
    volume.setData(rows.map(toVolume));
  };

  const paintStudies = (): void => {
    const rows = buffer.getAll();
    const closes = rows.map((kline) => kline.close);
    const times = rows.map((kline) => kline.openTime);
    const ma = studies.get('ma');
    if (ma) {
      ma.setData(toLine(studyPoints(times, simpleMovingAverage(closes, MA_PERIOD))));
    }
    const ema = studies.get('ema');
    if (ema) {
      ema.setData(toLine(studyPoints(times, exponentialMovingAverage(closes, EMA_PERIOD))));
    }
    const macd = studies.get('macd');
    const signal = studies.get('signal');
    const histogram = studies.get('histogram');
    if (macd && signal && histogram) {
      const points = movingAverageConvergenceDivergence(closes, MACD_FAST, MACD_SLOW, MACD_SIGNAL);
      const macdPoints: StudyPoint[] = [];
      const signalPoints: StudyPoint[] = [];
      const histogramPoints: StudyPoint[] = [];
      for (let index = 0; index < points.length; index += 1) {
        const openTime = times[index];
        const point = points[index];
        if (openTime == null || !point) continue;
        if (point.macd != null) macdPoints.push({ openTime, value: point.macd });
        if (point.signal != null) signalPoints.push({ openTime, value: point.signal });
        if (point.histogram != null) histogramPoints.push({ openTime, value: point.histogram });
      }
      macd.setData(toLine(macdPoints));
      signal.setData(toLine(signalPoints));
      histogram.setData(toHistogram(histogramPoints));
    }
    const rsi = studies.get('rsi');
    if (rsi) {
      rsi.setData(toLine(studyPoints(times, relativeStrengthIndex(closes, RSI_PERIOD))));
    }
  };

  const paintAll = (): void => {
    paintCandles();
    paintStudies();
  };

  const clearStudies = (): void => {
    for (const series of studies.values()) {
      chart.removeSeries(series);
    }
    studies.clear();
    const paneCount = chart.panes().length;
    for (let index = paneCount - 1; index >= 1; index -= 1) {
      chart.removePane(index);
    }
  };

  const addLine = (key: string, pane: number, title: string, color: string): ISeriesApi<'Line'> => {
    const series = chart.addSeries(
      LineSeries,
      {
        color,
        lineWidth: 2,
        title,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      },
      pane,
    );
    studies.set(key, series);
    return series;
  };

  const rebuildStudies = (): void => {
    clearStudies();
    if (active.includes('ma')) {
      addLine('ma', 0, `MA ${MA_PERIOD}`, THEME.ma);
    }
    if (active.includes('ema')) {
      addLine('ema', 0, `EMA ${EMA_PERIOD}`, THEME.ema);
    }

    let pane = 1;
    if (active.includes('macd')) {
      const histogram = chart.addSeries(
        HistogramSeries,
        {
          title: 'MACD',
          priceLineVisible: false,
          lastValueVisible: false,
        },
        pane,
      );
      studies.set('histogram', histogram);
      addLine('macd', pane, `MACD ${MACD_FAST},${MACD_SLOW},${MACD_SIGNAL}`, THEME.macd);
      addLine('signal', pane, 'Signal', THEME.signal);
      chart.panes()[pane]?.setStretchFactor(0.28);
      pane += 1;
    }
    if (active.includes('rsi')) {
      const rsi = addLine('rsi', pane, `RSI ${RSI_PERIOD}`, THEME.rsi);
      rsi.createPriceLine({
        price: 70,
        color: THEME.crosshair,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
      rsi.createPriceLine({
        price: 30,
        color: THEME.crosshair,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
      chart.panes()[pane]?.setStretchFactor(0.24);
    }
  };

  const onRange = (range: LogicalRange | null): void => {
    if (!range || buffer.getAll().length < 2) return;
    if (range.from < 8) options.onReachStart?.();
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);

  const coalescer = new RealtimeCoalescer(animationFrameScheduler, (batch) => {
    let reload = false;
    for (const kline of batch) {
      if (buffer.upsert(kline) === 'insert') reload = true;
    }
    if (reload) {
      paintAll();
      return;
    }
    for (const kline of batch) {
      candles.update(toCandle(kline));
      volume.update(toVolume(kline));
    }
    paintStudies();
  });

  rebuildStudies();

  return {
    setHistory(klines) {
      coalescer.cancel();
      buffer.reset(klines);
      paintAll();
    },
    prependHistory(klines) {
      const range = chart.timeScale().getVisibleLogicalRange();
      const added = buffer.prepend(klines);
      paintAll();
      if (range && added > 0) {
        chart.timeScale().setVisibleLogicalRange({
          from: range.from + added,
          to: range.to + added,
        });
      }
      return added;
    },
    applyRealtime(kline) {
      coalescer.push(kline);
    },
    setIndicators(indicators) {
      active = normalizeIndicators(indicators);
      rebuildStudies();
      paintStudies();
    },
    getCandles() {
      return buffer.getAll();
    },
    destroy() {
      coalescer.cancel();
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.remove();
    },
  };
}
