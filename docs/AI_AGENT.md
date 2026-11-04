# Alpha Terminal — AI Agent

> Provider 适配、Tool Calling 与 Agent 执行流程
>
> Version: 1.0.0  
> Based on: PRD / ARCHITECTURE / DATA_MODEL  
> Status: Draft  
> Required before: Phase 2

---

## 1. 目标

构建 **Model Agnostic** 的金融分析 Agent：

- 用户自备模型与 API Key。
- AI 负责理解意图与组织分析。
- 行情、指标、风险等精确计算全部由工具/引擎完成。
- 允许输出 WAIT / NO_SIGNAL，禁止无依据强行交易建议。

---

## 2. 包划分

| Package | 职责 |
|---|---|
| `ai-providers` | 厂商协议适配：chat、stream、tool calling、能力探测 |
| `ai-core` | Agent 循环、Tool Registry、校验、限流、结果规整 |
| `apps/server` | HTTP/SSE/WS 编排、鉴权、对话持久化 |
| `apps/web` | 对话 UI、流式展示、工具状态、分析卡片 |

依赖方向：

```text
server → ai-core → ai-providers
ai-core（tools）→ market-core / indicator-engine / risk-engine / strategy-engine
```

`ai-core` 不得实现 RSI/MACD/仓位公式。

---

## 3. Provider 抽象

```ts
type ProviderId = 'openai_compatible' | 'anthropic';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolName?: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodSchema; // 或 JSON Schema
}

interface ProviderStreamEvent {
  type: 'text-delta' | 'tool-call' | 'tool-call-delta' | 'finish' | 'error';
  data: unknown;
}

interface AIProvider {
  readonly id: ProviderId;
  testConnection(config: ModelRuntimeConfig): Promise<TestResult>;
  detectCapabilities(config: ModelRuntimeConfig): Promise<ModelCapabilities>;
  streamChat(req: StreamChatRequest): AsyncIterable<ProviderStreamEvent>;
}

interface ModelCapabilities {
  streaming: boolean;
  tools: boolean;
  jsonSchemaTools: boolean;
}
```

能力探测：

- 不能假设所有 OpenAI Compatible 网关都完整支持 tools。
- 若 `tools=false`，Agent 应降级为「无工具回答」并明确告知限制，或拒绝金融分析类请求。

---

## 4. Tool Registry

### 4.1 首批工具

| 工具 | 分类 | 底层 |
|---|---|---|
| `get_ticker` | Market | market-core |
| `get_klines` | Market | market-core |
| `calculate_rsi` | Technical | indicator-engine |
| `calculate_macd` | Technical | indicator-engine |
| `analyze_trend` | Structure | indicator/strategy helpers |
| `find_support_resistance` | Structure | 自研结构分析 |
| `evaluate_entry_conditions` | Strategy | strategy-engine |
| `calculate_rr` | Risk | risk-engine |
| `calculate_position_size` | Risk | risk-engine |
| `calculate_max_loss` | Risk | risk-engine |

### 4.2 工具契约

```ts
interface ToolContext {
  requestId: string;
  symbolId?: string;
  interval?: string;
  now: number;
}

interface ToolResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
  meta: {
    source: string;
    asOf: number; // 数据时间
    params: Record<string, unknown>;
  };
}
```

规则：

1. 入参必须 schema 校验。
2. 出参必须带 `asOf` / `params`，供分析追溯。
3. 数据不足返回 `INSUFFICIENT_DATA`，不得编造。
4. 行情过期返回 `STALE_DATA`。

---

## 5. Agent 执行流程

```text
User Message + Terminal Context
        │
        ▼
Build System Prompt
  - 角色：研究助手，非投资承诺
  - 必须用工具获取数据
  - 允许 WAIT/NO_SIGNAL
  - confidence ≠ 胜率
        │
        ▼
Provider.streamChat(messages, tools)
        │
        ├─ text-delta ──► 推送给前端
        │
        ├─ tool-call ──► 校验 ──► 执行 Tool ──► 追加 tool message ──► 继续循环
        │
        └─ finish ──► 规范化 AnalysisResult ──► 持久化
```

### 5.1 循环约束

| 约束 | 建议值 |
|---|---|
| 最大工具调用轮数 | 6–10 |
| 单工具超时 | 与模型 timeout 分离，例如 10–30s |
| 总对话超时 | ModelConfig.timeoutMs |
| 并行工具 | V1 可串行，降低复杂度 |

超限时返回已收集证据 + 明确说明未完成原因。

### 5.2 终端上下文

前端可附带：

```json
{
  "symbolId": "binance:spot:BTC/USDT",
  "interval": "15m",
  "marketType": "spot"
}
```

System/开发者消息应提示：默认分析当前上下文品种，除非用户另指定。

---

## 6. 分析结果结构

```ts
interface AnalysisResult {
  status:
    | 'LONG'
    | 'SHORT'
    | 'WAIT'
    | 'NO_SIGNAL'
    | 'INSUFFICIENT_DATA'
    | 'STALE_DATA';
  marketState: string;
  rationale: string[];
  bias?: 'long' | 'short' | 'neutral';
  entry?: { from: number; to: number };
  stopLoss?: number;
  takeProfit?: number[];
  riskReward?: number;
  intervalsUsed: string[];
  dataAsOf: number;
  modelConfidence?: number; // 主观置信，不得展示为胜率
  riskNotes: string[];
  toolTrace: Array<{
    toolName: string;
    params: Record<string, unknown>;
    asOf?: number;
  }>;
}
```

UI 必须以独立字段展示风险提示；不得把 `modelConfidence` 标成 Win Rate。

---

## 7. 流式协议映射

见 [API.md](./API.md) AI 事件：

- `ai.message.delta`
- `ai.tool.call`
- `ai.tool.result`
- `ai.message.completed`
- `ai.error`

`ai.tool.result` 建议只推摘要，完整大数据不必全部进 UI。

---

## 8. 安全与合规约束

1. API Key 仅存在服务端加密存储 / OS 密钥库。
2. 日志禁止打印 Key 与完整 Authorization。
3. Tool 不得提供下单、平仓、改杠杆能力（V1）。
4. Prompt 需声明：研究辅助，不构成投资建议，不保证收益。
5. 用户要求「保证赚钱」「自动交易」时，应拒绝并说明产品边界。

---

## 9. 失败与降级

| 场景 | 行为 |
|---|---|
| Provider 不可达 | 返回可重试错误 |
| 无 Tool Calling | 明确降级或拒绝分析 |
| 工具失败 | 将错误回传模型；连续失败则中止 |
| 数据缺口 | `INSUFFICIENT_DATA` |
| 行情过期 | `STALE_DATA` |
| 模型胡编数字 | 前端以 toolTrace/数据快照为准做校验提示（尽可能） |

---

## 10. 测试重点

- [ ] OpenAI Compatible / Anthropic 流式对话
- [ ] Tool schema 校验拒绝非法参数
- [ ] 最大调用轮数生效
- [ ] 无数据时不会强行 LONG/SHORT
- [ ] 分析记录包含数据时间与参数
- [ ] Key 不出现在日志与前端存储

---

## 11. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [API.md](./API.md)
- [DATA_MODEL.md](./DATA_MODEL.md)
- [PRD.md](./PRD.md)
