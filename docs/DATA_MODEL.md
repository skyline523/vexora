# Alpha Terminal — Data Model

> 核心数据结构、实体关系与统一行情类型
>
> Version: 1.0.0  
> Based on: PRD v1.0.0  
> Status: Draft  
> Required before: Phase 1 行情与持久化开发

---

## 1. 设计原则

1. **统一内部模型**：交易所差异收敛在 Adapter；上层只看统一类型。
2. **市场类型隔离**：`Spot` 与 `USDT_PERPETUAL` 不得仅靠 symbol 字符串区分。
3. **时间统一 UTC**：存储与事件时间戳使用 UTC 毫秒；展示时转本地时区。
4. **可追溯**：分析、策略、回测结果需能引用当时使用的数据与参数。
5. **冷热分离**：配置/元数据进 SQLite；大体量历史行情进文件系统。

---

## 2. 统一行情类型（Market Core）

### 2.1 枚举与标识

```ts
type ExchangeId = 'binance'; // 后续可扩展 'okx' 等

type MarketType = 'spot' | 'usdt_perpetual';

type KlineInterval =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '12h'
  | '1d' | '1w';

/** 内部统一交易品种标识 */
interface MarketSymbol {
  exchange: ExchangeId;
  marketType: MarketType;
  /** 统一规范，例如 BTC/USDT */
  base: string;
  quote: string;
  /** 交易所原始 symbol，例如 BTCUSDT */
  rawSymbol: string;
  /** 稳定唯一键：binance:spot:BTC/USDT */
  symbolId: string;
}
```

`symbolId` 建议格式：

```text
{exchange}:{marketType}:{BASE}/{QUOTE}
```

示例：

- `binance:spot:BTC/USDT`
- `binance:usdt_perpetual:BTC/USDT`

### 2.2 Ticker

```ts
interface Ticker {
  symbolId: string;
  exchange: ExchangeId;
  marketType: MarketType;
  lastPrice: number;
  bidPrice?: number;
  askPrice?: number;
  high24h?: number;
  low24h?: number;
  volume24h?: number;
  quoteVolume24h?: number;
  priceChangePercent24h?: number;
  ts: number; // exchange event time, UTC ms
  receivedAt: number; // local receive time, UTC ms
}
```

### 2.3 Kline

```ts
interface Kline {
  symbolId: string;
  interval: KlineInterval;
  openTime: number;  // candle start, UTC ms
  closeTime: number; // candle end, UTC ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;      // base asset volume
  quoteVolume?: number;
  tradeCount?: number;
  /** true = 该周期已收盘确认；false/undefined = 进行中 */
  closed: boolean;
  ts: number;
  receivedAt: number;
}
```

规则：

- 同一 `(symbolId, interval, openTime)` 唯一。
- 实时更新使用 `update`；收盘后 `closed=true`。
- 合并时以 `openTime` 去重，后到且更新的数据覆盖未收盘 K 线。

### 2.4 Trade

```ts
interface Trade {
  symbolId: string;
  tradeId: string; // exchange trade id as string
  price: number;
  qty: number;
  quoteQty?: number;
  side: 'buy' | 'sell' | 'unknown';
  ts: number;
  receivedAt: number;
}
```

### 2.5 OrderBook

```ts
interface OrderBookLevel {
  price: number;
  qty: number;
}

interface OrderBookSnapshot {
  symbolId: string;
  bids: OrderBookLevel[]; // 高价 -> 低价
  asks: OrderBookLevel[]; // 低价 -> 高价
  ts: number;
  receivedAt: number;
  sequence?: string; // 交易所序列号（如有）
}

interface OrderBookDelta {
  symbolId: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  ts: number;
  receivedAt: number;
  sequence?: string;
  prevSequence?: string;
}
```

V1 可先以 Snapshot 轮询/刷新为主；Delta 合并在 Adapter 能力成熟后启用。

### 2.6 MarketEvent

```ts
type MarketEvent =
  | { type: 'ticker'; payload: Ticker }
  | { type: 'kline'; payload: Kline }
  | { type: 'trade'; payload: Trade }
  | { type: 'orderbook_snapshot'; payload: OrderBookSnapshot }
  | { type: 'orderbook_delta'; payload: OrderBookDelta }
  | { type: 'connection'; payload: ConnectionStatus }
  | { type: 'gap_detected'; payload: GapInfo }
  | { type: 'error'; payload: MarketError };

interface ConnectionStatus {
  exchange: ExchangeId;
  marketType: MarketType;
  channel: string;
  state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
  ts: number;
}

interface GapInfo {
  symbolId: string;
  interval: KlineInterval;
  fromOpenTime: number;
  toOpenTime: number;
}

interface MarketError {
  code: string;
  message: string;
  exchange?: ExchangeId;
  symbolId?: string;
  retryable: boolean;
  ts: number;
}
```

---

## 3. Exchange Adapter 契约

```ts
interface ExchangeAdapter {
  readonly id: ExchangeId;

  getExchangeInfo(marketType: MarketType): Promise<ExchangeInstrument[]>;
  getTicker(symbol: MarketSymbol): Promise<Ticker>;
  getKlines(params: GetKlinesParams): Promise<Kline[]>;
  getOrderBookSnapshot(symbol: MarketSymbol, depth?: number): Promise<OrderBookSnapshot>;

  subscribeKlines(symbol: MarketSymbol, interval: KlineInterval, sink: MarketSink): Subscription;
  subscribeTrades(symbol: MarketSymbol, sink: MarketSink): Subscription;
  subscribeOrderBook?(symbol: MarketSymbol, sink: MarketSink): Subscription;

  disconnect(): Promise<void>;
}

interface ExchangeInstrument {
  symbol: MarketSymbol;
  pricePrecision: number;
  quantityPrecision: number;
  status: 'trading' | 'break' | 'unknown';
  contractType?: 'usdt_perpetual';
}
```

Adapter 负责：

- 原始 REST/WS 协议。
- 符号映射。
- 限频与重连细节（也可上交给连接管理器）。
- 输出统一类型。

---

## 4. SQLite 实体（配置与元数据）

### 4.1 ER 概览

```text
ExchangeConfig 1───* WatchlistItem
ModelConfig
AppSetting

Conversation 1───* Message
AnalysisRecord

Strategy 1───* BacktestRun
BacktestRun 1───* BacktestTrade (可选，或文件存储)
```

### 4.2 ExchangeConfig

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| exchange | text | `binance` |
| label | text | 显示名 |
| enabled | int | 0/1 |
| apiKeyEnc | text nullable | 加密后的只读 Key（可选） |
| apiSecretEnc | text nullable | 加密 Secret（可选） |
| createdAt | integer | UTC ms |
| updatedAt | integer | UTC ms |

V1 公开行情可不填 Key。

### 4.3 ModelConfig

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | uuid |
| provider | text | `openai_compatible` / `anthropic` |
| label | text | |
| baseUrl | text | |
| modelId | text | |
| apiKeyEnc | text | 加密存储 |
| temperature | real | |
| maxOutputTokens | integer | |
| timeoutMs | integer | |
| supportsTools | int | 0/1/未知探测结果 |
| isDefault | int | 0/1 |
| createdAt / updatedAt | integer | |

### 4.4 WatchlistItem

| 字段 | 类型 | 说明 |
|---|---|---|
| id | text PK | |
| symbolId | text unique | 统一符号 |
| exchange | text | |
| marketType | text | |
| base / quote / rawSymbol | text | |
| sortOrder | integer | |
| createdAt | integer | |

### 4.5 AppSetting

| 字段 | 类型 | 说明 |
|---|---|---|
| key | text PK | 例如 `default.symbolId` |
| valueJson | text | JSON 值 |
| updatedAt | integer | |

常用 key：

- `default.exchange`
- `default.marketType`
- `default.symbolId`
- `default.interval`
- `theme`
- `dataDir`

### 4.6 Conversation / Message / AnalysisRecord

```ts
interface Conversation {
  id: string;
  title: string;
  modelConfigId?: string;
  createdAt: number;
  updatedAt: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolPayloadJson?: string;
  createdAt: number;
}

interface AnalysisRecord {
  id: string;
  conversationId?: string;
  symbolId: string;
  interval: KlineInterval;
  status: 'LONG' | 'SHORT' | 'WAIT' | 'NO_SIGNAL' | 'INSUFFICIENT_DATA' | 'STALE_DATA';
  summary: string;
  resultJson: string;      // 结构化分析
  dataSnapshotJson: string; // 关键行情/指标快照或引用
  modelConfigId?: string;
  modelId?: string;
  createdAt: number;
}
```

### 4.7 Strategy / BacktestRun

```ts
interface Strategy {
  id: string;
  name: string;
  description?: string;
  configJson: string; // 入场/出场/止损止盈参数
  createdAt: number;
  updatedAt: number;
}

interface BacktestRun {
  id: string;
  strategyId: string;
  paramsJson: string;   // 交易所、品种、区间、手续费等
  status: 'pending' | 'running' | 'completed' | 'failed';
  metricsJson?: string; // 收益、回撤、胜率等摘要
  artifactPath?: string; // data/backtest/...
  errorMessage?: string;
  createdAt: number;
  finishedAt?: number;
}
```

---

## 5. 文件系统数据

### 5.1 历史行情

路径建议：

```text
data/market/{exchange}/{marketType}/{BASE}-{QUOTE}/{interval}/
  2024-01.jsonl
```

单条记录与 `Kline` 对齐。V1 可用 JSONL；数据量增大后再评估 Parquet。

### 5.2 回测产物

```text
data/backtest/{backtestRunId}/
  summary.json
  equity_curve.jsonl
  trades.jsonl
```

SQLite 仅存元数据与摘要，明细走文件。

---

## 6. 前端视图模型（非持久化）

```ts
interface TerminalViewState {
  activeExchange: ExchangeId;
  activeMarketType: MarketType;
  activeSymbolId: string;
  activeInterval: KlineInterval;
  watchlist: MarketSymbol[];
  connection: ConnectionStatus['state'];
}
```

图表数据由 TanStack Query / WS 推送填充，不作为 SQLite 实体。

---

## 7. 校验与精度

- 价格与数量在边界使用 `number`；展示按 `pricePrecision` / `quantityPrecision` 格式化。
- 关键计算（仓位、回测权益）避免无意义的字符串币种运算；需要更高精度时在 Risk/Backtest 内明确策略（后续可引入 decimal 库）。
- 所有外部输入（API Body、Tool 参数）经 Zod schema 校验。

---

## 8. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [API.md](./API.md)
- [MARKET_ENGINE.md](./MARKET_ENGINE.md)
- [BACKTEST_ENGINE.md](./BACKTEST_ENGINE.md)
