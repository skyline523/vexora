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

const LEGEND_STYLE_ID = 'vx-chart-legend-style';

function ensureLegendStyle(): void {
  if (document.getElementById(LEGEND_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = LEGEND_STYLE_ID;
  style.textContent = `
    .vx-ohlc {
      position: absolute;
      z-index: 4;
      top: 8px;
      left: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 10px;
      max-width: calc(100% - 72px);
      padding: 4px 8px;
      pointer-events: none;
      font-family: "IBM Plex Mono", Consolas, monospace;
      font-size: 11px;
      line-height: 1.45;
      color: #9aabc2;
      background: rgba(13, 19, 27, 0.86);
    }
    .vx-ohlc b { font-weight: 560; color: #e7eef8; }
    .vx-ohlc .up { color: #2fbf71; }
    .vx-ohlc .down { color: #ef5b5b; }
    .vx-extreme {
      position: absolute;
      z-index: 4;
      display: none;
      align-items: center;
      height: 0;
      pointer-events: none;
      white-space: nowrap;
    }
    .vx-extreme-line {
      width: 14px;
      height: 1px;
      background: #e7eef8;
      flex: none;
    }
    .vx-extreme-text {
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      font-size: 11px;
      line-height: 14px;
      color: #e7eef8;
    }
    .vx-extreme.is-left { flex-direction: row-reverse; }
  `;
  document.head.appendChild(style);
}

function formatPrice(value: number): string {
  const digits = value >= 1000 ? 2 : value >= 1 ? 4 : 6;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}

function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatCandleTime(openTime: number): string {
  const date = new Date(openTime);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}-${day} ${hour}:${minute}`;
}

function createExtremeCallout(): HTMLDivElement {
  const element = document.createElement('div');
  element.className = 'vx-extreme';
  const line = document.createElement('span');
  line.className = 'vx-extreme-line';
  const text = document.createElement('span');
  text.className = 'vx-extreme-text';
  element.append(line, text);
  return element;
}

function fadeChart(container: HTMLElement): void {
  container.style.transition = 'none';
  container.style.opacity = '0.45';
  requestAnimationFrame(() => {
    container.style.transition = 'opacity 240ms ease';
    container.style.opacity = '1';
  });
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

  ensureLegendStyle();
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }
  const legend = document.createElement('div');
  legend.className = 'vx-ohlc';
  legend.style.display = 'none';
  const legendTime = document.createElement('span');
  const legendOpen = document.createElement('b');
  const legendHigh = document.createElement('b');
  const legendLow = document.createElement('b');
  const legendClose = document.createElement('b');
  const legendChange = document.createElement('span');
  const legendVolume = document.createElement('b');
  for (const [label, node] of [
    ['O', legendOpen],
    ['H', legendHigh],
    ['L', legendLow],
    ['C', legendClose],
  ] as const) {
    const item = document.createElement('span');
    item.append(label, ' ', node);
    legend.append(item);
  }
  legend.prepend(legendTime);
  const legendVolumeLabel = document.createElement('span');
  legendVolumeLabel.append('Vol ', legendVolume);
  legend.append(legendChange, legendVolumeLabel);
  container.append(legend);

  const showLegend = (row: Kline): void => {
    const delta = row.close - row.open;
    const percent = row.open === 0 ? 0 : (delta / row.open) * 100;
    const direction = delta >= 0 ? 'up' : 'down';
    legendTime.textContent = formatCandleTime(row.openTime);
    legendOpen.textContent = formatPrice(row.open);
    legendHigh.textContent = formatPrice(row.high);
    legendLow.textContent = formatPrice(row.low);
    legendClose.textContent = formatPrice(row.close);
    legendClose.className = direction;
    legendChange.className = direction;
    legendChange.textContent = `${delta >= 0 ? '+' : ''}${formatPrice(delta)} (${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%)`;
    legendVolume.textContent = formatVolume(row.volume);
    legend.style.display = 'flex';
  };

  const hideLegend = (): void => {
    legend.style.display = 'none';
  };

  let pointerInside = false;
  const showCandleAt = (seconds: number | null): void => {
    const row =
      seconds == null ? buffer.last() : (buffer.findByOpenTime(seconds * 1000) ?? buffer.last());
    if (!row) {
      hideLegend();
      return;
    }
    showLegend(row);
  };
  const onEnter = (): void => {
    pointerInside = true;
    showCandleAt(null);
  };
  const onLeave = (): void => {
    pointerInside = false;
    hideLegend();
  };
  container.addEventListener('pointerenter', onEnter);
  container.addEventListener('pointerleave', onLeave);

  const onCrosshair = (param: { point?: { x: number; y: number }; time?: unknown }): void => {
    if (!pointerInside && !param.point) {
      hideLegend();
      return;
    }
    showCandleAt(typeof param.time === 'number' ? param.time : null);
  };
  chart.subscribeCrosshairMove(onCrosshair);

  const highCallout = createExtremeCallout();
  const lowCallout = createExtremeCallout();
  container.append(highCallout, lowCallout);
  let calloutFrame = 0;

  const placeCallout = (
    element: HTMLDivElement,
    x: number,
    y: number,
    plotLeft: number,
    plotRight: number,
    paneTop: number,
    paneBottom: number,
  ): void => {
    element.style.display = 'flex';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.classList.remove('is-left');
    element.style.transform = 'translate(0, -50%)';

    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const margin = 4;
    const overflowRight = x + width > plotRight - margin;
    const overflowLeft = x - width < plotLeft + margin;
    const placeLeft = overflowRight && (!overflowLeft || x > (plotLeft + plotRight) / 2);
    element.classList.toggle('is-left', placeLeft);

    let shiftY = -height / 2;
    if (y + shiftY < paneTop + margin) shiftY = paneTop + margin - y;
    if (y + shiftY + height > paneBottom - margin) shiftY = paneBottom - margin - height - y;
    element.style.transform = placeLeft ? `translate(-100%, ${shiftY}px)` : `translate(0, ${shiftY}px)`;
  };

  const hideCallout = (element: HTMLDivElement): void => {
    element.style.display = 'none';
  };

  const syncExtremeCallouts = (): void => {
    cancelAnimationFrame(calloutFrame);
    calloutFrame = requestAnimationFrame(() => {
      const extremes = buffer.visibleExtremes(chart.timeScale().getVisibleLogicalRange());
      const pane = chart.panes()[0]?.getHTMLElement();
      if (!extremes || !pane) {
        hideCallout(highCallout);
        hideCallout(lowCallout);
        return;
      }

      const paneTop = pane.offsetTop;
      const paneBottom = paneTop + pane.clientHeight;
      const plotLeft = 0;
      const plotRight = Math.max(0, container.clientWidth - chart.priceScale('right').width());
      const highX = chart.timeScale().timeToCoordinate(toTime(extremes.highOpenTime));
      const lowX = chart.timeScale().timeToCoordinate(toTime(extremes.lowOpenTime));
      const highY = candles.priceToCoordinate(extremes.high);
      const lowY = candles.priceToCoordinate(extremes.low);

      const show = (
        element: HTMLDivElement,
        x: number | null,
        y: number | null,
        text: string,
      ): void => {
        if (x == null || y == null || x < plotLeft || x > plotRight) {
          hideCallout(element);
          return;
        }
        const textNode = element.querySelector('.vx-extreme-text');
        if (textNode) textNode.textContent = text;
        placeCallout(element, x, y + paneTop, plotLeft, plotRight, paneTop, paneBottom);
      };

      show(highCallout, highX, highY, formatPrice(extremes.high));
      show(lowCallout, lowX, lowY, formatPrice(extremes.low));
    });
  };

  const onRange = (range: LogicalRange | null): void => {
    syncExtremeCallouts();
    if (!range || buffer.size() < 2) return;
    if (range.from < 8) options.onReachStart?.();
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
  chart.timeScale().subscribeSizeChange(syncExtremeCallouts);

  const coalescer = new RealtimeCoalescer(animationFrameScheduler, (batch) => {
    let reload = false;
    for (const kline of batch) {
      if (buffer.upsert(kline) === 'insert') reload = true;
    }
    if (reload) {
      paintAll();
    } else {
      for (const kline of batch) {
        candles.update(toCandle(kline));
        volume.update(toVolume(kline));
      }
      paintStudies();
    }
    syncExtremeCallouts();
  });

  let shownSeries: { symbolId: string; interval: string } | null = null;

  rebuildStudies();

  return {
    setHistory(klines) {
      const next = klines[0];
      if (
        shownSeries &&
        next &&
        (shownSeries.symbolId !== next.symbolId || shownSeries.interval !== next.interval)
      ) {
        fadeChart(container);
      }
      if (next) {
        shownSeries = { symbolId: next.symbolId, interval: next.interval };
      }
      coalescer.cancel();
      buffer.reset(klines);
      paintAll();
      syncExtremeCallouts();
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
      syncExtremeCallouts();
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
      cancelAnimationFrame(calloutFrame);
      coalescer.cancel();
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      chart.timeScale().unsubscribeSizeChange(syncExtremeCallouts);
      highCallout.remove();
      lowCallout.remove();
      container.removeEventListener('pointerenter', onEnter);
      container.removeEventListener('pointerleave', onLeave);
      legend.remove();
      chart.remove();
    },
  };
}
