# Vexora — API

> 前后端 HTTP API、WebSocket 事件与请求响应结构
>
> Version: 1.0.0  
> Based on: PRD v1.0.0 / DATA_MODEL v1.0.0  
> Status: Draft  
> Required before: 前后端接口联调

---

## 1. 约定

### 1.1 Base

- HTTP Base：`http://127.0.0.1:8787`（端口可配置）
- WebSocket：`ws://127.0.0.1:8787/ws`
- Content-Type：`application/json`
- 时间戳：UTC 毫秒 number
- 金额价格：number（JSON）

### 1.2 统一响应包

成功：

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "uuid",
    "ts": 1730000000000
  }
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "SYMBOL_NOT_FOUND",
    "message": "Symbol not found",
    "details": {}
  },
  "meta": {
    "requestId": "uuid",
    "ts": 1730000000000
  }
}
```

### 1.3 常见错误码

| code | HTTP | 说明 |
|---|---:|---|
| `BAD_REQUEST` | 400 | 参数校验失败 |
| `UNAUTHORIZED` | 401 | 本地会话无效 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `EXCHANGE_ERROR` | 502 | 交易所上游错误 |
| `RATE_LIMITED` | 429 | 触发限频 |
| `INTERNAL_ERROR` | 500 | 未分类内部错误 |
| `STALE_DATA` | 409 | 数据过期（分析场景） |

### 1.4 本地会话（V1）

本地服务可启用简单 Bearer Token（启动时生成或配置）：

```http
Authorization: Bearer <local-session-token>
```

未配置时可仅绑定 localhost；生产构建建议强制校验。

---

## 2. Phase 1 HTTP API

### 2.1 Health

`GET /api/health`

```json
{
  "ok": true,
  "data": {
    "status": "up",
    "version": "0.1.0"
  }
}
```

### 2.2 交易品种

`GET /api/markets/instruments`

Query：

| 参数 | 必填 | 说明 |
|---|---|---|
| exchange | 是 | `binance` |
| marketType | 是 | `spot` \| `usdt_perpetual` |

响应 `data`：`ExchangeInstrument[]`

### 2.3 历史 K 线

`GET /api/markets/klines`

Query：

| 参数 | 必填 | 说明 |
|---|---|---|
| symbolId | 是 | `binance:spot:BTC/USDT` |
| interval | 是 | `1m` 等 |
| limit | 否 | 默认 500，最大 1500 |
| endTime | 否 | 向前加载用 |
| startTime | 否 | 区间查询 |

响应：

```json
{
  "ok": true,
  "data": {
    "symbolId": "binance:spot:BTC/USDT",
    "interval": "1m",
    "klines": []
  }
}
```

### 2.4 Ticker

`GET /api/markets/ticker?symbolId=binance:spot:BTC/USDT`

响应 `data`：`Ticker`

### 2.5 OrderBook Snapshot

`GET /api/markets/orderbook?symbolId=...&depth=20`

响应 `data`：`OrderBookSnapshot`

### 2.6 自选列表

`GET /api/watchlist`  
`POST /api/watchlist`  
`DELETE /api/watchlist/:id`  
`PATCH /api/watchlist/reorder`

POST body：

```json
{
  "symbolId": "binance:spot:BTC/USDT"
}
```

### 2.7 交易所配置

`GET /api/exchanges`  
`PUT /api/exchanges/:id`  
`POST /api/exchanges/:id/test-connection`

PUT 不回显明文 secret；只读 Key 更新时使用 write-only 字段。

### 2.8 应用设置

`GET /api/settings`  
`PUT /api/settings`

```json
{
  "defaultExchange": "binance",
  "defaultMarketType": "spot",
  "defaultSymbolId": "binance:spot:BTC/USDT",
  "defaultInterval": "15m",
  "theme": "dark"
}
```

---

## 3. Phase 2+ HTTP API（草案）

### 3.1 模型管理

- `GET /api/models`
- `POST /api/models`
- `PUT /api/models/:id`
- `DELETE /api/models/:id`
- `POST /api/models/:id/test`
- `POST /api/models/:id/default`

### 3.2 AI 对话

`POST /api/ai/chat`（也可仅用 SSE/WS）

请求：

```json
{
  "conversationId": "optional",
  "modelConfigId": "optional",
  "message": "分析 BTC 15m 趋势",
  "context": {
    "symbolId": "binance:spot:BTC/USDT",
    "interval": "15m"
  }
}
```

流式：`POST /api/ai/chat/stream`（SSE）或 WebSocket `ai.chat`。

### 3.3 策略与回测

- `GET/POST /api/strategies`
- `PUT/DELETE /api/strategies/:id`
- `POST /api/backtests`
- `GET /api/backtests/:id`
- `GET /api/backtests/:id/trades`

细节见 [BACKTEST_ENGINE.md](./BACKTEST_ENGINE.md)。

---

## 4. WebSocket 协议

### 4.1 连接

```text
ws://127.0.0.1:8787/ws?token=<local-session-token>
```

连接成功后服务端发送：

```json
{
  "type": "sys.hello",
  "payload": {
    "serverTime": 1730000000000,
    "version": "0.1.0"
  }
}
```

### 4.2 客户端 → 服务端

#### 订阅 K 线

```json
{
  "type": "market.subscribe",
  "requestId": "r1",
  "payload": {
    "channel": "kline",
    "symbolId": "binance:spot:BTC/USDT",
    "interval": "1m"
  }
}
```

#### 订阅成交

```json
{
  "type": "market.subscribe",
  "requestId": "r2",
  "payload": {
    "channel": "trade",
    "symbolId": "binance:spot:BTC/USDT"
  }
}
```

#### 订阅订单簿

```json
{
  "type": "market.subscribe",
  "requestId": "r3",
  "payload": {
    "channel": "orderbook",
    "symbolId": "binance:spot:BTC/USDT",
    "depth": 20
  }
}
```

#### 取消订阅

```json
{
  "type": "market.unsubscribe",
  "requestId": "r4",
  "payload": {
    "subscriptionId": "sub_xxx"
  }
}
```

#### 心跳

```json
{ "type": "sys.ping", "payload": { "ts": 1730000000000 } }
```

### 4.3 服务端 → 客户端

#### 订阅确认

```json
{
  "type": "market.subscribed",
  "requestId": "r1",
  "payload": {
    "subscriptionId": "sub_xxx",
    "channel": "kline",
    "symbolId": "binance:spot:BTC/USDT",
    "interval": "1m"
  }
}
```

#### 行情事件

```json
{
  "type": "market.kline",
  "payload": {
    /* Kline */
  }
}
```

```json
{
  "type": "market.trade",
  "payload": {
    /* Trade */
  }
}
```

```json
{
  "type": "market.orderbook",
  "payload": {
    /* OrderBookSnapshot */
  }
}
```

```json
{
  "type": "market.ticker",
  "payload": {
    /* Ticker */
  }
}
```

#### 连接状态

```json
{
  "type": "market.connection",
  "payload": {
    "exchange": "binance",
    "marketType": "spot",
    "channel": "kline",
    "state": "reconnecting",
    "ts": 1730000000000
  }
}
```

#### 缺口与错误

```json
{
  "type": "market.gap",
  "payload": {
    "symbolId": "binance:spot:BTC/USDT",
    "interval": "1m",
    "fromOpenTime": 1,
    "toOpenTime": 2
  }
}
```

```json
{
  "type": "market.error",
  "payload": {
    "code": "EXCHANGE_ERROR",
    "message": "...",
    "retryable": true,
    "ts": 1730000000000
  }
}
```

```json
{ "type": "sys.pong", "payload": { "ts": 1730000000000 } }
```

### 4.4 订阅生命周期规则

1. 切换交易对/周期前，客户端应 unsubscribe 旧订阅，或由服务端按 connection 覆盖策略替换。
2. 推荐服务端支持「同一连接同一 channel 只保留最新 symbol/interval」。
3. 服务端断线重连后自动恢复当前订阅，并向客户端发 `market.connection`。
4. 前端卸载页面时关闭 WS，避免残留订阅。

---

## 5. AI 流式事件（Phase 2）

可通过 SSE 或 WS 发送：

| type | 说明 |
|---|---|
| `ai.message.delta` | 文本增量 |
| `ai.tool.call` | 开始调用工具 |
| `ai.tool.result` | 工具结果摘要 |
| `ai.message.completed` | 完成 |
| `ai.error` | 失败 |

示例：

```json
{
  "type": "ai.tool.call",
  "payload": {
    "toolCallId": "call_1",
    "toolName": "get_klines",
    "args": {
      "symbolId": "binance:spot:BTC/USDT",
      "interval": "15m",
      "limit": 100
    }
  }
}
```

---

## 6. 版本与兼容

- 本文档为契约草案，字段可在实现中用 Zod 固化。
- 破坏性变更需提升 `version` 并在 `sys.hello` 中告知。
- 前端以 `type` 字段做事件路由，忽略未知字段以保持前向兼容。

---

## 7. 相关文档

- [DATA_MODEL.md](./DATA_MODEL.md)
- [MARKET_ENGINE.md](./MARKET_ENGINE.md)
- [AI_AGENT.md](./AI_AGENT.md)
- [DEVELOPMENT.md](./DEVELOPMENT.md)
