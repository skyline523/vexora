# Alpha Terminal — Architecture

> 整体架构、模块边界、依赖关系与数据流
>
> Version: 1.0.0  
> Based on: PRD v1.0.0 / TASKS v1.0.0  
> Status: Draft

---

## 1. 目标

本文档定义 Alpha Terminal 的系统架构，作为 Phase 1 及后续阶段开发的边界依据。

核心目标：

- 以模块化单体保证开发效率与清晰边界。
- 将行情、指标、策略、风险、回测与 AI 解耦。
- 保证 AI 只能通过工具调用业务能力，不能直接替代精确计算。
- 为后续扩展交易所、云端部署预留结构，但不提前引入复杂基础设施。

---

## 2. 架构模式

### 2.1 Modular Monolith

V1 采用模块化单体：

- 单一可部署后端进程（NestJS）。
- 业务能力拆分为独立 Package。
- Package 通过明确接口交互，禁止跨层随意引用。
- 不引入微服务、消息中间件或独立行情服务进程。

可选 `apps/worker` 仅用于后续重任务（如大批量回测），Phase 1 可不启用。

### 2.2 部署形态

```text
┌─────────────────────────────────────────────┐
│                 Local Machine               │
│                                             │
│  ┌─────────────┐         ┌───────────────┐  │
│  │  apps/web   │  HTTP   │  apps/server  │  │
│  │  React SPA  │◄───────►│  NestJS API   │  │
│  └─────────────┘   WS    └───────┬───────┘  │
│                                  │          │
│                                  ▼          │
│                    ┌─────────────────────┐  │
│                    │ packages/* engines  │  │
│                    └──────────┬──────────┘  │
│                               │             │
│               ┌───────────────┼───────────┐ │
│               ▼               ▼           ▼ │
│          SQLite           data/market   Exchange REST/WS
└─────────────────────────────────────────────┘
```

- 本地服务默认监听 `127.0.0.1`。
- 前端不直连交易所 WebSocket。
- 行情统一经后端 Market Data Engine 处理后推送给前端。

---

## 3. 应用与包结构

```text
alpha-terminal/
├── apps/
│   ├── web/                 # React 交易终端 UI
│   ├── server/              # NestJS API / WebSocket / 编排层
│   └── worker/              # 可选：回测等重任务（后续）
├── packages/
│   ├── shared/              # 公共类型、常量、工具
│   ├── chart-engine/        # 图表封装（可被 web 使用）
│   ├── market-core/         # 行情标准化、订阅、缓存、合并
│   ├── exchange-adapters/
│   │   └── binance/         # Binance REST + WebSocket
│   ├── ai-core/             # Agent、Tool Registry、执行循环
│   ├── ai-providers/        # OpenAI Compatible / Anthropic 等
│   ├── indicator-engine/    # 技术指标计算
│   ├── strategy-engine/     # 策略定义与信号
│   ├── backtest-engine/     # 历史回测
│   ├── risk-engine/         # 仓位与风险计算
│   └── database/            # Drizzle schema / repository
├── data/
│   ├── market/              # 历史行情文件
│   ├── backtest/            # 回测产物
│   └── exports/
└── docs/
```

### 3.1 Apps 职责

| App | 职责 | 禁止事项 |
|---|---|---|
| `web` | UI、交互、图表展示、本地 UI 状态 | 交易所协议解析、指标/风险精确计算、密钥明文存储 |
| `server` | HTTP/WS 入口、鉴权、编排、订阅生命周期 | 在 Controller 内堆叠业务算法 |
| `worker` | 长时间回测/批处理（后续） | 与 web 直接耦合 |

### 3.2 Packages 职责

| Package | 职责 |
|---|---|
| `shared` | 跨端共享类型与纯函数 |
| `exchange-adapters/*` | 将交易所协议映射为统一行情类型 |
| `market-core` | 订阅管理、缓存、历史/实时合并、缺口补偿 |
| `chart-engine` | Lightweight Charts 封装与指标叠加 |
| `indicator-engine` | 确定性指标计算 |
| `strategy-engine` | 策略配置与信号生成 |
| `risk-engine` | 仓位、止损、盈亏比等确定性风险计算 |
| `backtest-engine` | 时间推进、订单模拟、绩效统计 |
| `ai-core` | Agent 循环、Tool 注册与调用约束 |
| `ai-providers` | 各厂商模型适配 |
| `database` | SQLite schema、migration、repository |

---

## 4. 模块边界

### 4.1 硬边界

1. Exchange / Market / Indicator / Strategy / Risk / Backtest **不得依赖 AI**。
2. AI 只能通过 Tool Registry 调用上述能力。
3. 核心业务 Package **不得直接依赖 React 或 NestJS**。
4. 前端 **不得** 维护交易所 WebSocket；行情必须经 `market-core`。
5. 前端组件 **不得** 实现交易所数据处理逻辑。
6. AI 模块 **不得** 自行实现指标或风险公式。
7. Backtest **不得** 依赖 AI 输出。

### 4.2 允许依赖方向

```text
web ──► shared, chart-engine
server ──► shared, database, market-core, exchange-adapters,
           ai-core, ai-providers, indicator-engine,
           strategy-engine, risk-engine, backtest-engine

ai-core ──► shared
ai-core（经 Tool）──► market-core / indicator / strategy / risk

market-core ──► shared, exchange-adapters/*
indicator-engine ──► shared
strategy-engine ──► shared, indicator-engine
risk-engine ──► shared
backtest-engine ──► shared, strategy-engine, risk-engine, market-core(历史读取)
```

禁止反向依赖，例如：

- `exchange-adapters` → `ai-core`
- `market-core` → `apps/web`
- `indicator-engine` → `apps/server`

---

## 5. 运行时分层

```text
┌──────────────────────────────────────────────┐
│ Presentation                                 │
│  Trading Terminal / Settings / AI Panel      │
├──────────────────────────────────────────────┤
│ Application / API                            │
│  Nest Controllers / Gateways / Use-cases     │
├──────────────────────────────────────────────┤
│ Domain Engines                               │
│  Market / Indicator / Strategy / Risk / BT   │
├──────────────────────────────────────────────┤
│ Adapters                                     │
│  Binance / AI Providers / SQLite / FS        │
└──────────────────────────────────────────────┘
```

- Presentation：展示与交互。
- Application：请求编排、权限、会话、订阅协调。
- Domain：纯业务规则与确定性计算。
- Adapters：外部系统适配。

---

## 6. 核心数据流

### 6.1 实时行情流（Phase 1 主链路）

```text
Binance WS/REST
    │
    ▼
Binance Adapter  ──标准化──►  MarketEvent / Kline / Trade / OrderBook
    │
    ▼
Market Data Engine
    ├── 订阅管理
    ├── 实时缓存
    ├── 历史合并 / 去重 / 排序
    └── 缺口检测与 REST 补偿
    │
    ▼
Server WebSocket Gateway
    │
    ▼
Web Terminal / Chart Engine
```

### 6.2 AI 分析流（Phase 2）

```text
User Prompt
    │
    ▼
AI Assistant UI
    │
    ▼
Server Agent Orchestrator
    │
    ▼
ai-core Agent Loop
    ├── Provider（流式输出 / Tool Calling）
    └── Tool Registry
            ├── get_ticker / get_klines
            ├── calculate_rsi / calculate_macd
            ├── analyze_trend / find_support_resistance
            └── calculate_rr / position_size / max_loss
    │
    ▼
结构化分析结果 + 引用数据快照
```

### 6.3 回测流（Phase 4）

```text
Strategy Config + Backtest Params
    │
    ▼
Backtest Engine
    ├── 读取历史行情（FS / market-core）
    ├── 时间推进
    ├── Strategy 信号
    ├── 模拟下单（手续费 / 滑点 / 资金费）
    └── Risk / 绩效统计
    │
    ▼
结果元数据写入 SQLite + 明细写入 data/backtest
```

---

## 7. 状态与存储边界

| 数据类型 | 存储位置 | 说明 |
|---|---|---|
| 交易所/模型/自选/策略配置 | SQLite | 结构化、可迁移 |
| 对话与分析记录 | SQLite | 含数据快照引用 |
| 回测元数据 | SQLite | 参数、版本、摘要指标 |
| 实时行情 | 内存缓存 | 不落全量 SQLite |
| 历史 K 线大文件 | `data/market` | Parquet / JSONL / CSV 择一 |
| API Key | OS 密钥库或加密后的本地存储 | 禁止前端明文 localStorage |

---

## 8. 扩展点

架构预留以下扩展，但不在 Phase 1 实现：

| 扩展点 | 方式 |
|---|---|
| 新交易所 | 新增 `exchange-adapters/<name>`，实现统一 Adapter 接口 |
| 新 AI Provider | 新增 `ai-providers` 实现 |
| 新指标 | 在 `indicator-engine` 注册纯函数指标 |
| 云端部署 | 替换监听地址、会话鉴权与密钥存储，不改 Domain 层 |
| Worker 拆分 | 将回测执行迁到 `apps/worker`，通过本地任务队列或进程调用 |

---

## 9. 非目标（V1）

- 微服务拆分
- Redis / PostgreSQL / TimescaleDB / BullMQ
- 自动实盘下单
- 前端直连交易所
- AI 自动执行交易

---

## 10. 相关文档

| 文档 | 用途 |
|---|---|
| [TECH_STACK.md](./TECH_STACK.md) | 技术选型与版本 |
| [DATA_MODEL.md](./DATA_MODEL.md) | 核心数据结构 |
| [API.md](./API.md) | HTTP / WebSocket 契约 |
| [MARKET_ENGINE.md](./MARKET_ENGINE.md) | 行情引擎细节 |
| [AI_AGENT.md](./AI_AGENT.md) | Agent 与 Tool Calling |
| [BACKTEST_ENGINE.md](./BACKTEST_ENGINE.md) | 回测引擎 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 本地开发与规范 |
| [PRD.md](./PRD.md) | 产品需求 |
| [TASKS.md](./TASKS.md) | 开发任务 |
