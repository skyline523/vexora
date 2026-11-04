# Alpha Terminal — Development Guide

> 环境配置、开发规范、启动与测试说明
>
> Version: 1.0.0  
> Based on: TECH_STACK / ARCHITECTURE / TASKS  
> Status: Draft

---

## 1. 文档阅读顺序

开工前建议按阶段阅读：

| 阶段 | 必读 |
|---|---|
| 开工前 | [PRD.md](./PRD.md)、[TASKS.md](./TASKS.md)、[ARCHITECTURE.md](./ARCHITECTURE.md)、[TECH_STACK.md](./TECH_STACK.md)、本文 |
| Phase 1 前 | [DATA_MODEL.md](./DATA_MODEL.md) |
| 接口开发前 | [API.md](./API.md) |
| 行情模块前 | [MARKET_ENGINE.md](./MARKET_ENGINE.md) |
| Phase 2 前 | [AI_AGENT.md](./AI_AGENT.md) |
| Phase 4 前 | [BACKTEST_ENGINE.md](./BACKTEST_ENGINE.md) |

---

## 2. 环境要求

| 工具 | 版本 |
|---|---|
| Node.js | 22 LTS（推荐） |
| pnpm | 9+ / 10+ |
| Git | 2.x |
| OS | Windows / macOS / Linux |

可选：

- VS Code / Cursor
- Playwright 浏览器依赖（跑 E2E 时安装）

---

## 3. 仓库结构（目标）

```text
alpha-terminal/
├── apps/web
├── apps/server
├── apps/worker          # 可选，后续
├── packages/*
├── data/                # 本地数据（勿提交密钥）
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

当前仓库若尚未初始化 Monorepo，以 [TASKS.md](./TASKS.md) Task 01 为准搭建。

---

## 4. 初始化（工程就绪后）

```bash
pnpm install
cp .env.example .env
pnpm dev
```

预期：

- Web：`http://127.0.0.1:5173`（Vite 默认，可改）
- Server：`http://127.0.0.1:8787`
- `GET /api/health` 返回 ok

常用脚本（规划）：

| 脚本 | 作用 |
|---|---|
| `pnpm dev` | 并行启动 web + server |
| `pnpm build` | 构建全部 |
| `pnpm test` | 单测 |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test:e2e` | Playwright |

---

## 5. 环境变量

示例（以最终 `.env.example` 为准）：

```bash
# Server
HOST=127.0.0.1
PORT=8787
LOCAL_SESSION_TOKEN=dev-token-change-me
DATABASE_URL=file:../../data/alpha-terminal.sqlite
DATA_DIR=../../data

# Web
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_WS_URL=ws://127.0.0.1:8787/ws
```

规则：

1. 真实 API Key 只放本机环境或系统密钥库，不进 Git。
2. `.env` 加入 `.gitignore`。
3. 用 Zod（或同等）在启动时校验必要变量。

---

## 6. 开发规范

### 6.1 TypeScript

- 全量 TypeScript，避免 `any`（必要时 `unknown` + 收窄）。
- 跨包共享类型放 `packages/shared`。
- 对外 API 入参/工具参数用 Zod schema。

### 6.2 模块边界

必须遵守 [ARCHITECTURE.md](./ARCHITECTURE.md)：

- 前端不直连交易所 WS。
- Domain packages 不依赖 React/NestJS。
- Market/Indicator/Strategy/Risk/Backtest 不依赖 AI。

### 6.3 提交与分支（建议）

- `main` 保持可运行。
- 功能分支：`feat/task-03-binance-adapter`
- Commit 信息侧重动机，例如：`fix: release stale kline subscriptions on symbol switch`

### 6.4 代码风格

- ESLint + Prettier 统一格式。
- 组件/模块保持单一职责。
- 禁止在 React 组件内解析交易所原始报文。
- 禁止在 AI 模块内手写指标公式。

### 6.5 日志

- 使用统一 logger。
- 禁止输出 API Key、Secret、Authorization 全文。
- 行情 debug 日志注意采样，避免刷屏。

---

## 7. 本地数据目录

```text
data/
├── market/
├── backtest/
├── exports/
└── alpha-terminal.sqlite
```

- `data/` 默认 gitignore（可保留 `.gitkeep`）。
- 历史行情与回测产物体积可能很大，勿误提交。

---

## 8. 测试说明

### 8.1 单元测试（Vitest）

优先覆盖：

- Adapter 映射（样例 fixture）
- Kline 合并/去重/缺口检测
- 指标计算
- 风险计算公式
- 回测成交价与手续费

```bash
pnpm test
pnpm --filter @alpha/market-core test
```

### 8.2 E2E（Playwright）

关键路径：

- 启动后加载 BTC/USDT 历史 K 线
- 切换周期
- WS 实时更新（可 mock）
- 自选持久化

### 8.3 手工验收

对照 TASKS 各 Task 验收清单与 Phase 1 最终验收。

长时间跑：连续 2 小时观察内存与行情稳定性。

---

## 9. 调试技巧

### 行情

1. 先验证 REST 历史 K 线。
2. 再开 WS，确认 `market.connection=connected`。
3. 断网测试重连与 gap fill。
4. 切换交易对后确认旧订阅已释放。

### AI（Phase 2）

1. 先跑 `POST /api/models/:id/test`。
2. 用最小工具集验证 tool calling。
3. 检查 `toolTrace` 与 `dataAsOf` 是否写入分析记录。

### 回测（Phase 4）

1. 用极短区间 + 固定参数验证复现。
2. 对比关闭/开启手续费与滑点的差异。
3. 检查是否误用当根 bar 的未来信息。

---

## 10. 安全基线

- 服务默认绑定 `127.0.0.1`。
- 开启本地 session token。
- CORS 仅允许本地前端源。
- 交易所 Key 默认只读，V1 不请求交易权限。

---

## 11. Definition of Done（摘要）

每个 Task 合并前：

- [ ] 功能符合 TASKS 描述
- [ ] typecheck / lint 通过
- [ ] 核心逻辑有必要测试
- [ ] 无明显运行时错误
- [ ] 模块边界未被破坏
- [ ] 相关文档已更新
- [ ] 本地可运行验证

---

## 12. 相关文档索引

| 文档 | 说明 |
|---|---|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 架构与依赖 |
| [TECH_STACK.md](./TECH_STACK.md) | 技术选型 |
| [DATA_MODEL.md](./DATA_MODEL.md) | 数据模型 |
| [API.md](./API.md) | 接口契约 |
| [MARKET_ENGINE.md](./MARKET_ENGINE.md) | 行情引擎 |
| [AI_AGENT.md](./AI_AGENT.md) | AI Agent |
| [BACKTEST_ENGINE.md](./BACKTEST_ENGINE.md) | 回测引擎 |
| [PRD.md](./PRD.md) | 产品需求 |
| [TASKS.md](./TASKS.md) | 任务计划 |
