# Alpha Terminal — Product Requirements Document

> 产品需求文档（PRD）
>
> Version: 1.0.0  
> Status: Draft  
> Project: Alpha Terminal

---

## 1. 项目概述

### 1.1 项目定位

Alpha Terminal 是一个本地优先的个人 AI 加密货币金融交易分析终端。

用户可以自主配置 AI 模型和交易所数据接口，通过自然语言与 AI 交互，获取实时行情分析、技术指标解读、交易机会推荐、策略验证和历史回测等能力。

产品以专业金融终端为设计方向，提供高性能 K 线图表、多交易所行情接入、AI 辅助决策以及可复现的策略回测能力。

### 1.2 核心目标

构建一个由真实市场数据驱动、由程序负责量化计算、由 AI 提供智能分析的个人交易研究平台。

核心业务闭环：

1. 获取交易所实时行情。
2. 对市场数据进行标准化和计算。
3. 通过 AI 理解用户需求并调用金融分析工具。
4. 输出交易策略和入场建议。
5. 通过历史数据进行策略回测。
6. 评估策略表现和风险。

### 1.3 产品原则

- **Local First**：优先支持个人本地部署，数据和配置由用户掌控。
- **Model Agnostic**：用户自主配置模型，不绑定特定 AI 厂商。
- **Multi Exchange**：统一接入多个交易所。
- **Data Driven**：分析结果必须基于真实行情和可验证的数据。
- **AI Assisted**：AI 提供辅助分析，不直接替代量化计算。
- **Reproducible**：策略和回测结果必须可追溯、可复现。
- **Risk First**：风险评估优先于交易机会推荐。

---

## 2. 用户与使用场景

### 2.1 目标用户

主要面向有一定加密货币交易经验，希望借助 AI 提升行情分析和策略研究效率的个人交易者。

### 2.2 核心使用场景

| 场景 | 用户需求 |
|---|---|
| 实时行情 | 查看不同交易所的现货和合约行情 |
| 技术分析 | 查看 K 线、成交量、技术指标和趋势 |
| AI 问答 | 询问行情走势、技术形态和市场结构 |
| 入场推荐 | 分析当前市场是否存在值得关注的交易机会 |
| 风险评估 | 计算止损、止盈、仓位和盈亏比 |
| 策略验证 | 根据历史行情验证策略有效性 |
| 历史回测 | 评估策略收益、回撤、胜率等指标 |
| 模型管理 | 自主配置不同厂商的 AI 模型 |

---

## 3. 产品范围

### 3.1 市场范围

第一阶段支持以下市场：

- 加密货币现货（Spot）
- USDT 永续合约（USDT Perpetual）

注意：现货和永续合约需要分别维护交易品种、行情订阅和市场规则，不能仅通过相同交易对名称判断其属于同一种市场。

### 3.2 交易所范围

首批支持：

- Binance

后续可扩展 OKX 等交易所。

### 3.3 交易权限范围

V1 版本仅支持：

- 行情数据读取。
- 交易所公开市场数据接入。
- 可选只读账户数据接入。
- 策略分析和回测。

不支持：

- 自动下单。
- 自动平仓。
- 自动修改杠杆。
- 自动执行交易策略。

交易所 API 默认不需要交易权限。未来如果增加交易执行，必须单独设计权限隔离、风险限制和用户确认机制。

### 3.4 部署范围

- V1：个人本地部署。
- 后续：支持云端部署和多设备访问。
- 本地服务默认监听 `127.0.0.1`。
- 本地数据和 API Key 应具备安全保护机制。

---

## 4. 功能需求

### 4.1 交易终端（Trading Terminal）

<重点>核心模块，优先完成。</重点>

提供专业金融终端式的行情工作区。

主要功能：

- 顶部导航和市场信息。
- 左侧自选交易对列表。
- 中央 K 线图表。
- 右侧 AI 分析面板。
- 底部订单簿和实时成交。
- 支持调整面板宽度。
- 支持切换交易所、市场类型和交易对。
- 支持切换 K 线周期。

布局参考专业金融终端，采用深色主题，强调信息密度和操作效率。

### 4.2 行情数据（Market Data）

#### 实时行情

- 获取交易所 Ticker。
- 获取实时 K 线。
- 获取实时成交数据。
- 获取订单簿数据。
- 支持 WebSocket 长连接。
- 支持断线重连。
- 支持行情订阅和取消订阅。

#### 历史行情

- 获取历史 K 线。
- 支持分页加载。
- 支持不同时间周期。
- 支持历史数据和实时数据合并。
- 检测并补齐行情缺口。
- 处理重复数据和乱序数据。

#### 数据标准化

统一不同交易所的数据结构。

核心市场类型：

- Spot
- USDT Perpetual

所有行情使用 UTC 时间戳存储，前端根据本地时区展示。

### 4.3 K 线图表（Chart Engine）

使用 TradingView Lightweight Charts 作为基础图表引擎。

#### V1 必须支持

- K 线图。
- 成交量柱状图。
- 实时 K 线更新。
- 历史 K 线加载。
- 十字光标。
- 缩放和拖拽。
- 时间周期切换。
- 交易对切换。
- 图表主题。
- 历史数据向前加载。

#### 基础技术指标

- MA
- EMA
- MACD
- RSI

#### 后续扩展

- 支撑位和阻力位。
- 趋势线。
- 多图表布局。
- 多周期同步。
- AI 入场、止损和止盈标记。
- 自定义绘图工具。
- 高级订单流分析。

### 4.4 AI 模型管理（AI Model Management）

用户可以自主接入不同厂商的 AI 模型。

#### 模型配置

支持配置：

- Provider
- API Key
- Base URL
- Model ID
- Temperature
- Max Output Tokens
- Timeout
- Tool Calling 能力
- 默认模型

#### 模型管理

- 新增模型。
- 编辑模型。
- 删除模型。
- 测试模型连接。
- 设置默认模型。
- 在不同模型之间切换。

#### Provider 支持

首批考虑：

- OpenAI Compatible
- Anthropic

不能假设所有兼容接口都具有完全一致的 Tool Calling、流式输出和参数行为，需要通过能力检测处理。

### 4.5 AI 金融分析（Financial Agent）

AI 通过自然语言理解用户意图，并调用平台提供的金融分析工具。

#### 支持的分析方向

- 市场趋势分析。
- 多周期行情分析。
- 技术指标解读。
- 支撑位和阻力位分析。
- 入场机会推荐。
- 止损和止盈建议。
- 风险收益比计算。
- 仓位和最大亏损计算。
- 市场环境分析。
- 交易策略解释。

#### AI 工具分类

| 分类 | 工具示例 |
|---|---|
| Market | get_ticker、get_klines |
| Technical | calculate_rsi、calculate_macd |
| Structure | analyze_trend、find_support_resistance |
| Strategy | evaluate_entry_conditions、calculate_rr |
| Risk | calculate_position_size、calculate_max_loss |

#### 分析结果

AI 分析结果应包含：

- 当前市场状态。
- 主要分析依据。
- 多空倾向。
- 入场区间。
- 止损位置。
- 止盈目标。
- 风险收益比。
- 分析使用的时间周期。
- 行情数据时间。
- 分析状态。
- 风险提示。

#### 分析状态

至少支持：

- `LONG`：偏多机会。
- `SHORT`：偏空机会。
- `WAIT`：等待机会。
- `NO_SIGNAL`：没有有效信号。
- `INSUFFICIENT_DATA`：数据不足。
- `STALE_DATA`：行情数据过期。

AI 不应被要求每次都输出做多或做空建议。

模型的 confidence 仅代表模型自身对分析结果的主观置信程度，不等于真实交易胜率。

### 4.6 策略管理（Strategy Engine）

支持用户定义和管理交易策略。

主要能力：

- 创建策略。
- 编辑策略。
- 删除策略。
- 配置指标和参数。
- 定义入场条件。
- 定义出场条件。
- 定义止损和止盈规则。
- 生成策略信号。
- 记录策略执行结果。

策略引擎应能够独立运行，不依赖 AI。

### 4.7 历史回测（Backtest Engine）

使用历史行情数据模拟策略运行。

#### 回测配置

- 交易所。
- 市场类型。
- 交易品种。
- K 线周期。
- 回测时间范围。
- 初始资金。
- 手续费。
- 滑点。
- 杠杆。
- 仓位规则。
- 资金费率。

#### 回测指标

- 总收益率。
- 净利润。
- 最大回撤。
- 胜率。
- 盈亏比。
- Profit Factor。
- Sharpe Ratio。
- 交易次数。
- 平均持仓时间。

#### 回测要求

- 避免未来数据泄漏（Look-ahead Bias）。
- 考虑手续费和滑点。
- 永续合约考虑资金费率。
- 考虑杠杆和保证金。
- 尽可能模拟强平风险。
- 支持样本内和样本外验证。
- 记录完整回测参数，保证结果可复现。

现货和永续合约需要使用不同的交易模拟与收益计算逻辑。

### 4.8 历史记录（History）

记录用户与系统的关键交互。

包括：

- AI 对话历史。
- AI 分析记录。
- 策略记录。
- 回测记录。
- 模型配置变更。
- 关键行情快照。

分析记录应保留当时使用的行情数据、指标参数、模型版本和分析时间，方便复盘。

### 4.9 系统设置（Settings）

- 交易所配置。
- AI 模型配置。
- 默认交易所。
- 默认市场类型。
- 默认交易品种。
- 默认 K 线周期。
- 主题设置。
- 本地数据目录。
- 系统日志。

API Key 不应明文保存在前端 localStorage。

优先使用操作系统密钥存储；无法使用时，应采用主密码派生密钥进行加密存储。

---

## 5. 页面与模块规划

| 页面 | 核心功能 | 优先级 |
|---|---|---|
| Trading Terminal | 行情、K 线、订单簿、成交 | P0 |
| AI Assistant | AI 对话和金融分析 | P1 |
| Model Settings | AI 模型配置 | P1 |
| Exchange Settings | 交易所配置 | P0 |
| Watchlist | 自选交易对 | P0 |
| Strategy | 策略管理 | P2 |
| Backtest | 历史回测 | P2 |
| Analysis History | 分析记录 | P2 |
| System Settings | 系统设置 | P1 |

---

## 6. 技术架构

### 6.1 架构模式

采用模块化单体（Modular Monolith）。

V1 不采用微服务，优先保证开发效率、模块边界和后续扩展能力。

### 6.2 技术栈

| 领域 | 技术 |
|---|---|
| Monorepo | pnpm + Turborepo |
| Frontend | React 19 + TypeScript + Vite |
| Styling | CSS Modules + Less |
| UI | Ant Design 5 |
| Chart | TradingView Lightweight Charts |
| State | Zustand |
| Data Fetching | TanStack Query |
| Backend | NestJS |
| AI SDK | Vercel AI SDK |
| Database | SQLite + Drizzle ORM |
| Exchange | Binance REST + WebSocket |
| Indicator | 自研 Indicator Engine |
| Strategy | 自研 Strategy Engine |
| Backtest | 自研 Backtest Engine |
| Test | Vitest + Playwright |

### 6.3 目录结构

```text
alpha-terminal/
├── apps/
│   ├── web/
│   ├── server/
│   └── worker/
├── packages/
│   ├── shared/
│   ├── chart-engine/
│   ├── market-core/
│   ├── exchange-adapters/
│   │   └── binance/
│   ├── ai-core/
│   ├── ai-providers/
│   ├── indicator-engine/
│   ├── strategy-engine/
│   ├── backtest-engine/
│   ├── risk-engine/
│   └── database/
├── data/
│   ├── market/
│   ├── backtest/
│   └── exports/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── DATA_MODEL.md
│   ├── API.md
│   ├── MARKET_ENGINE.md
│   ├── AI_AGENT.md
│   ├── BACKTEST_ENGINE.md
│   ├── DEVELOPMENT.md
│   ├── PRD.md
│   └── TASKS.md
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### 6.4 核心模块依赖原则

- Exchange 不依赖 AI。
- Market 不依赖 AI。
- Indicator 不依赖 AI。
- Strategy 不依赖 AI。
- Backtest 不依赖 AI。
- Risk 不依赖 AI。
- AI 通过 Tool Registry 调用 Market、Indicator、Strategy 和 Risk 等模块。
- 核心业务 Package 不直接依赖 React 或 NestJS。

### 6.5 数据存储

SQLite 存储：

- 用户配置。
- 交易所配置。
- 模型配置。
- 自选列表。
- 对话和分析记录。
- 策略配置。
- 回测元数据。

历史行情大文件存储在本地文件系统。

初期不将所有实时行情持续写入 SQLite。

历史行情文件格式可根据后续数据量和查询需求选择 Parquet、JSONL 或 CSV。

---

## 7. 非功能性需求

### 7.1 性能

- 实时行情应保持稳定更新。
- K 线更新采用增量更新，不应每次全量刷新。
- 高频行情消息应支持合并渲染。
- 图表组件应避免重复创建实例。
- 指标计算与图表渲染解耦。
- 长时间运行不应出现明显内存泄漏。

### 7.2 稳定性

- WebSocket 自动重连。
- 网络恢复后补齐行情缺口。
- 处理重复、乱序和异常数据。
- 交易对切换时正确释放旧订阅。
- 现货与永续合约订阅相互隔离。

### 7.3 安全性

- API Key 加密存储。
- 本地服务默认只监听 localhost。
- 限制跨域访问。
- 本地接口增加会话校验。
- 交易所 API 默认只读。
- 不在日志中输出敏感密钥。

### 7.4 可维护性

- 模块之间保持清晰边界。
- 统一 TypeScript 类型定义。
- 核心业务逻辑具备单元测试。
- 交易所 Adapter 可独立扩展。
- AI Provider 可独立扩展。
- 回测结果可追溯和复现。

---

## 8. 版本规划

| 版本 | 目标 | 主要功能 |
|---|---|---|
| V1.0 | 实时行情终端 | Binance、K 线、基础指标 |
| V1.1 | AI 接入 | 模型管理、AI Assistant、Tool Calling |
| V1.2 | 金融分析 | 多周期分析、策略信号、风险计算 |
| V1.3 | 策略回测 | 策略管理、历史回测、绩效分析 |
| V1.4 | 产品完善 | 历史记录、安全、数据导出 |
| V2.0 | 扩展部署 | 云端部署、多设备访问、更多交易所 |

---

## 9. 核心产品原则与限制

1. AI 不能代替程序完成精确的行情、指标、仓位和风险计算。
2. 所有交易建议必须能够追溯到实际使用的数据。
3. AI 可以给出等待或无信号结论。
4. 回测结果不能被直接等同于未来收益。
5. 置信度不能被包装成真实胜率。
6. 数据缺失或过期时必须明确提示。
7. V1 不执行自动交易。
8. 产品仅提供研究和决策辅助，不构成投资收益保证。

---

## 10. V1.0 验收目标

V1.0 完成后，用户应能够：

- 本地启动前端和后端。
- 获取 Binance 现货行情。
- 获取 Binance USDT 永续行情。
- 查看历史 K 线和实时 K 线。
- 切换交易对和周期。
- 查看成交量。
- 使用基础技术指标。
- 查看实时成交和订单簿。
- 在网络异常后恢复行情订阅。
- 持久化保存自选列表和系统配置。
- 连续运行两小时，无明显内存增长和行情异常。

**V1.0 的核心验收标准：真实行情稳定、图表流畅、数据准确、模块边界清晰。**