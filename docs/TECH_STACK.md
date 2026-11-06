# Vexora — Tech Stack

> 技术选型、版本基线、选型理由与替代方案
>
> Version: 1.0.0  
> Based on: PRD v1.0.0  
> Status: Draft

---

## 1. 选型原则

1. **Local First**：优先适合单机部署、依赖少、易安装的技术。
2. **Type Safety**：前后端与共享包统一 TypeScript。
3. **模块可拆**：业务逻辑放 Package，框架可替换。
4. **够用即可**：不提前引入 Phase 当前用不到的基础设施。
5. **可验证**：核心计算与行情处理必须可单测。

---

## 2. 版本基线

> 下表为开工建议基线。实际锁定版本以各 package.json 为准，升级需评估破坏性变更。

| 领域 | 技术 | 建议版本 |
|---|---|---|
| Runtime | Node.js | 22 LTS |
| Package Manager | pnpm | 9.x / 10.x |
| Monorepo | Turborepo | 2.x |
| Language | TypeScript | 5.6+ |
| Frontend Framework | React | 19.x |
| Bundler | Vite | 6.x |
| UI | Ant Design | 5.x |
| Styling | CSS Modules + Less | Less 4.x |
| Charts | lightweight-charts | 4.x / 5.x |
| Client State | Zustand | 5.x |
| Server State | TanStack Query | 5.x |
| Backend | NestJS | 11.x |
| Validation | Zod | 3.x |
| AI SDK | Vercel AI SDK (`ai`) | 4.x / 5.x |
| ORM | Drizzle ORM | 0.39+ |
| Database | `@libsql/client`（本地 SQLite 文件） | 与 Drizzle 适配版本 |
| Test Unit | Vitest | 3.x |
| Test E2E | Playwright | 1.x |
| Lint | ESLint | 9.x |
| Format | Prettier | 3.x |

交易所：Binance REST + WebSocket（公开行情）。

---

## 3. 分层选型说明

### 3.1 Monorepo：pnpm + Turborepo

**理由**

- pnpm 依赖隔离清晰，适合多 Package。
- Turborepo 提供缓存与任务编排，便于 `dev/build/test`。
- 与「apps + packages」结构匹配。

**替代方案**

| 方案 | 何时考虑 |
|---|---|
| npm / yarn workspaces | 团队强制统一包管理器 |
| Nx | 仓库极大、需要更强生成器与约束图时 |
| 单仓无 monorepo | 仅原型验证，不推荐正式开发 |

### 3.2 前端：React 19 + Vite + TypeScript

**理由**

- 生态成熟，图表与 AI 流式 UI 资料丰富。
- Vite 启动快，适合终端类高频迭代。
- React 19 与现代数据获取库兼容良好。

**替代方案**

| 方案 | 取舍 |
|---|---|
| Next.js | SSR 对本地终端收益有限，增加复杂度 |
| Vue 3 | 可行，但当前 PRD 已定 React |
| Electron 先行 | V1 先做 Web 本地服务；Electron 仅评估 |

### 3.3 UI：Ant Design 5 + CSS Modules + Less

**理由**

- Ant Design 适合密集信息与表单配置页。
- CSS Modules 避免全局污染；Less 便于主题变量。
- 金融终端以深色高密度为主，不追求营销向视觉框架。

**替代方案**

| 方案 | 取舍 |
|---|---|
| Tailwind | 可提升样式速度，但需另建设计 token |
| shadcn/ui | 灵活，但需更多基础组件投入 |
| MUI | 可替代 Ant Design，生态同等成熟 |

### 3.4 图表：TradingView Lightweight Charts

**理由**

- 专为金融 K 线设计，性能好。
- 开源可商用（遵循其许可证）。
- 满足 V1 的 K 线、成交量、实时 update。

**替代方案**

| 方案 | 取舍 |
|---|---|
| TradingView Advanced Charts | 能力强，授权与嵌入成本更高 |
| ECharts | 通用图表强，金融交互需更多自研 |
| 自研 Canvas | 成本过高，不适合 V1 |

### 3.5 状态：Zustand + TanStack Query

**理由**

- Zustand：轻量 UI/会话状态。
- TanStack Query：服务端数据缓存、重试、失效策略。
- 避免 Redux 样板代码。

**替代方案**

| 方案 | 取舍 |
|---|---|
| Redux Toolkit | 复杂工作流多时再考虑 |
| Jotai / Valtio | 可用，团队熟悉度需评估 |
| 仅 Context | 不适合高频行情相关状态 |

### 3.6 后端：NestJS

**理由**

- 模块化与依赖注入天然适合 Modular Monolith。
- 对 WebSocket Gateway、配置、管道校验支持完整。
- 便于将 packages 注入为 providers。

**替代方案**

| 方案 | 取舍 |
|---|---|
| Fastify 裸服务 | 更轻，但需自建模块结构 |
| Hono | 适合边缘/轻量 API，复杂编排较弱 |
| Adonis / Nest 以外 Node 框架 | 可行，但生态与文档成本不同 |

### 3.7 AI：Vercel AI SDK

**理由**

- 统一流式输出与 Tool Calling 抽象。
- 便于接入 OpenAI Compatible 与 Anthropic。
- 与前端流式展示模式匹配。

**替代方案**

| 方案 | 取舍 |
|---|---|
| 直接调用各厂商 SDK | 可控，但重复适配成本高 |
| LangChain.js | 能力全，但过重且抽象多层 |
| 自研 Provider 层 | 长期可做，V1 优先借 SDK |

### 3.8 数据：SQLite + Drizzle ORM

**理由**

- SQLite 零运维，适合本地优先。
- 通过 `@libsql/client` 访问本地 `file:` SQLite，避免 Windows 上 `better-sqlite3` 原生编译问题。
- Drizzle 类型友好、SQL 透明、migration 清晰。
- 配置/记录类数据体量适合关系库；行情大文件走文件系统。

实现位置：`packages/database`（schema / migration / repository），由 `apps/server` 启动时初始化并 seed 默认交易所与自选。

**替代方案**

| 方案 | 取舍 |
|---|---|
| better-sqlite3 | 同步 API，但需原生编译（Node 版本/工具链敏感） |
| Prisma + SQLite | 可用，但客户端较重 |
| PostgreSQL | 云端阶段再评估 |
| DuckDB | 分析型查询强，可作为历史行情后续选项 |

### 3.9 交易所接入：自研 Binance Adapter

**理由**

- 只需公开行情，不需要完整交易 SDK。
- 自研便于映射统一 `MarketEvent` 与订阅生命周期。
- 避免引入过重 CCXT 运行时（若仅用行情子集）。

**替代方案**

| 方案 | 取舍 |
|---|---|
| CCXT / CCXT Pro | 多所覆盖快，但抽象层厚、调试成本高 |
| 官方 SDK | 若稳定且类型完善可局部采用 |

### 3.10 测试：Vitest + Playwright

**理由**

- Vitest 与 Vite/TS 同构，适合 packages 单测。
- Playwright 覆盖终端关键路径 E2E。

**替代方案**

| 方案 | 取舍 |
|---|---|
| Jest | 可用，但与 Vite 集成不如 Vitest 顺 |
| Cypress | E2E 可替代 Playwright |

---

## 4. 明确不采用（V1）

| 技术 | 原因 |
|---|---|
| Redis | 单机内存缓存足够 |
| PostgreSQL / TimescaleDB | 运维成本高，非本地优先 |
| Kafka / BullMQ | 无多服务削峰需求 |
| GraphQL | REST + WS 足够 |
| 微前端 | 过度设计 |
| 自动实盘交易 SDK 全量封装 | V1 无执行交易范围 |

---

## 5. 包管理与工程约定

- 使用 pnpm workspace。
- `packages/*` 以 TypeScript 源码或构建产物被 apps 引用，具体策略在工程初始化时确定（优先 TS project references 或内部包导出）。
- 统一 ESLint / Prettier / Vitest 配置，可放在根或 `packages/config-*`。
- 环境变量使用 `.env` + schema 校验（建议 Zod），禁止提交真实密钥。

---

## 6. 升级策略

1. 小版本依赖可随安全补丁升级。
2. 主版本升级需单独 Task，并跑核心单测与 Phase 对应验收。
3. 图表库、NestJS、AI SDK 升级前先在旁路分支验证流式与 WS 行为。

---

## 7. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DEVELOPMENT.md](./DEVELOPMENT.md)
- [PRD.md](./PRD.md)
