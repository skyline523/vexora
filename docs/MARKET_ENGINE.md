# Vexora — Market Engine

> 行情接入、订阅管理、缓存、重连与数据补偿
>
> Version: 1.0.0  
> Based on: ARCHITECTURE / DATA_MODEL / API  
> Status: Draft  
> Required before: Task 03–05 行情与图表联调

---

## 1. 目标

`market-core` 是 Phase 1 的核心领域模块，负责：

1. 通过 Exchange Adapter 获取 REST/WS 行情。
2. 将原始数据标准化为统一 `MarketEvent`。
3. 管理订阅生命周期。
4. 维护实时与历史缓存。
5. 合并、去重、排序、缺口检测与补偿。
6. 向 Server Gateway 输出稳定事件流。

非目标：

- 不在前端维护交易所连接。
- 不把全量实时行情写入 SQLite。
- 不执行交易。

实现位于 `packages/market-core`（`@vexora/market-core`）。`ExchangeAdapter` 由调用方注入，引擎只依赖 `@vexora/shared` 中的统一类型。

---

## 2. 组件结构

```text
                    ┌──────────────────────┐
                    │ ExchangeAdapter      │
                    │ (binance)            │
                    └──────────┬───────────┘
                               │ MarketEvent
                               ▼
┌──────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│ Subscription │───►│ MarketDataEngine     │───►│ Event Bus / WS  │
│ Registry     │    │  cache / merge / gap │    │ Gateway         │
└──────────────┘    └──────────┬───────────┘    └─────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ History Store (FS)   │
                    └──────────────────────┘
```

主要类/模块（逻辑名）：

| 模块 | 职责 |
|---|---|
| `ExchangeRegistry` | 按 exchangeId 解析 Adapter |
| `SubscriptionRegistry` | 订阅引用计数与释放 |
| `ConnectionManager` | WS 连接状态机与重连 |
| `KlineStore` | 历史 + 实时 K 线缓存 |
| `TradeBuffer` | 最近成交环形缓冲 |
| `OrderBookStore` | Snapshot（+ 可选 Delta） |
| `GapFiller` | REST 补齐缺口 |
| `MarketDataEngine` | 对外门面 |

---

## 3. 订阅管理

### 3.1 订阅键

```text
{channel}:{symbolId}[:{interval}]
```

示例：

- `kline:binance:spot:BTC/USDT:1m`
- `trade:binance:spot:BTC/USDT`
- `orderbook:binance:usdt_perpetual:BTC/USDT`

### 3.2 引用计数

- 多个 WS 客户端订阅同一键时，底层只建一条交易所订阅。
- `unsubscribe` 或客户端断开时减计数；归零则取消交易所订阅。
- 切换交易对时，必须释放旧键，避免幽灵行情。

### 3.3 Spot / Perp 隔离

- 连接、订阅表、缓存命名空间按 `marketType` 隔离。
- 禁止用同一 rawSymbol 跨市场复用缓存条目。

---

## 4. 连接与重连

### 4.1 状态机

```text
disconnected → connecting → connected ⇄ reconnecting → disconnected
```

状态变化通过 `market.connection` 对外广播。

### 4.2 重连策略

- 指数退避：例如 1s、2s、5s、10s、30s，上限 30s 或 60s。
- 对可恢复错误自动重连；对鉴权/永久错误标记不可重试。
- 重连成功后：
  1. 恢复订阅列表。
  2. 对 K 线执行缺口检测。
  3. 必要时 REST 拉历史补齐。

### 4.3 心跳

- 遵循 Binance WS 心跳要求（ping/pong）。
- 本地 Gateway 另有应用层 `sys.ping`，与交易所心跳分离。

---

## 5. 缓存设计

### 5.1 KlineStore

内存结构：

```text
Map<symbolId + interval, SortedKlineSeries>
```

能力：

- `setHistory(klines)`：REST 初次/分页加载。
- `applyRealtime(kline)`：同 `openTime` 更新或追加。
- `getRange(start, end)` / `getLast(n)`
- 限制最大长度（例如每个 series 保留最近 N 根，多余可落盘）。

合并规则：

1. 按 `openTime` 排序。
2. 相同 `openTime`：保留信息更新的一根（通常后到实时更新）。
3. `closed=true` 后原则上不再被更早乱序包覆盖，除非校验为修正数据。
4. REST 与 WS 重叠区间去重。

### 5.2 TradeBuffer

- 环形队列，例如最近 200–500 笔。
- 按 `tradeId` 去重。
- 乱序则插入后按 `ts` 排序（缓冲较短时可简化为丢弃过旧乱序）。

### 5.3 OrderBookStore

V1 建议：

1. REST/WS Snapshot 全量替换。
2. 定时刷新保证可用性。
3. Delta 合并作为增强项：校验 sequence，失败则重新 Snapshot。

---

## 6. 历史加载与向前翻页

图表向前拖拽时：

1. 前端请求 `GET /api/markets/klines`，带 `endTime=最早一根 openTime`。
2. Engine 先查内存/本地文件，不足再打交易所 REST。
3. 返回按时间升序的 K 线。
4. 与现有 series 合并去重。

注意：

- 避免与实时流并发写入时出现空洞；合并后跑一次 gap check。
- limit 设上限，防止一次拉取过大。

---

## 7. 缺口检测与补偿

### 7.1 检测

对固定 interval，期望相邻 `openTime` 差值为 interval 毫秒。

若 `nextOpenTime - prevOpenTime > intervalMs`，生成 `GapInfo`。

`GapInfo` 使用半开区间：缺失 K 线满足 `fromOpenTime <= openTime < toOpenTime`。`toOpenTime` 是缺口后第一根已有 K 线的 `openTime`；重连补偿时则为当前未收盘 K 线的 `openTime`。

### 7.2 补偿

`GapFiller`：

1. 计算缺失时间范围。
2. 调用 Adapter `getKlines`。
3. 合并入 `KlineStore`。
4. 广播 `market.gap`（可选）与补齐后的 `market.kline` 批量更新事件（实现可选择只推最终 series 片段）。

### 7.3 触发时机

- WS 重连成功后。
- 实时 K 线出现时间跳跃时。
- 历史与实时衔接失败时。

---

## 8. 数据质量规则

| 问题 | 处理 |
|---|---|
| 重复推送 | tradeId / openTime 去重 |
| 乱序 | 排序或丢弃过旧事件 |
| 断线 | 重连 + gap fill |
| 交易对切换 | 释放旧订阅，清空 UI 侧旧 series |
| 时钟偏差 | 记录 `ts` 与 `receivedAt`；展示以交易所 `ts` 为准 |
| 限频 | Adapter 侧排队/节流；向上返回 `RATE_LIMITED` |

陈旧数据：

- 若 `now - lastEventTs` 超过阈值，对 AI/分析接口返回 `STALE_DATA`。

---

## 9. 与 Chart Engine 的协作

1. 首屏：HTTP 拉历史 → `setData`。
2. 之后：WS `market.kline` → `update`。
3. 同一 `openTime` 更新同一根蜡烛。
4. 高频事件在前端用 `requestAnimationFrame` 合并渲染。
5. 指标计算输入来自标准化 Kline 数组，不直接读交易所 payload。

---

## 10. Binance 适配注意点

- Spot 与 USDT-M Futures 使用不同 REST/WS 域名与符号规则。
- 统一映射到 `MarketSymbol` / `symbolId`。
- K 线 interval 字符串与内部枚举对齐。
- 遵守官方连接数与订阅限制。
- 错误码与重试可恢复性分类。

---

## 11. 测试清单

- [x] Spot / Perp 同名交易对缓存不串扰
- [x] 订阅引用计数归零后底层退订
- [x] 断网恢复后自动重连并补齐缺口
- [x] 历史 + 实时衔接无重复 K 线
- [x] 向前加载不破坏当前实时更新
- [x] 切换 symbol/interval 后无旧数据残留
- [x] 连续运行内存稳定（系列长度有上限）

---

## 12. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DATA_MODEL.md](./DATA_MODEL.md)
- [API.md](./API.md)
- [TASKS.md](./TASKS.md)
