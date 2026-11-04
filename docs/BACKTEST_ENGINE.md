# Alpha Terminal — Backtest Engine

> 回测模型、订单模拟、手续费、滑点与绩效计算
>
> Version: 1.0.0  
> Based on: PRD / ARCHITECTURE / DATA_MODEL  
> Status: Draft  
> Required before: Phase 4

---

## 1. 目标

`backtest-engine` 使用历史行情与策略信号，在可复现前提下模拟交易并输出绩效。

原则：

1. **不依赖 AI**。
2. **避免未来函数**（Look-ahead Bias）。
3. **现货与永续分模型**。
4. **参数与数据版本可追溯**。
5. 回测收益 ≠ 未来收益。

---

## 2. 模块边界

```text
strategy-engine ──信号──► backtest-engine ◄── risk-engine（仓位/保证金规则）
                              │
                              ├── market history reader
                              ├── broker simulator
                              └── metrics calculator
```

输入：

- Strategy 配置
- Backtest 参数（品种、周期、区间、资金、费率等）
- 历史 K 线序列

输出：

- 摘要指标（SQLite `BacktestRun.metricsJson`）
- 明细产物（`data/backtest/{id}/`）

---

## 3. 回测配置

```ts
interface BacktestParams {
  exchange: 'binance';
  marketType: 'spot' | 'usdt_perpetual';
  symbolId: string;
  interval: KlineInterval;
  startTime: number;
  endTime: number;
  initialCapital: number;
  feeRate: number;          // 例如 0.001 = 0.1%
  slippageBps: number;      // 基点，例如 5 = 0.05%
  leverage?: number;        // 永续
  marginMode?: 'cross' | 'isolated';
  positionSizing: {
    mode: 'fixed_notional' | 'fixed_qty' | 'risk_percent';
    value: number;
  };
  fundingRateMode?: 'none' | 'historical' | 'constant';
  constantFundingRate?: number;
  seed?: number;            // 若有随机滑点模型
  dataVersion?: string;     // 行情文件版本/哈希
}
```

所有运行必须原样持久化 `paramsJson`。

---

## 4. 时间推进模型

V1 采用 **Bar-based** 回测（基于 K 线）：

```text
for bar in bars:
  1. 以 bar 的可用信息更新指标（仅用 close 已确认数据）
  2. 生成信号（默认使用已收盘 bar，避免用当根未来 high/low 作弊）
  3. 在约定成交价模型下模拟下单
  4. 更新持仓、保证金、资金费、强平检查
  5. 记录权益曲线点
```

### 4.1 成交价假设（必须写进参数）

可选模型：

| 模型 | 说明 | 偏差风险 |
|---|---|---|
| `next_open` | 信号在 bar N 收盘确认，在 N+1 open 成交 | 较稳健，推荐默认 |
| `close` | 在信号 bar close 成交 | 易乐观，需谨慎 |
| `ohlc_path` | 用 OHLC 路径估算止损触发 | 更细，实现更复杂 |

V1 默认：`next_open`。

止损/止盈触发：

- 保守：若同 bar 同时触及止损与止盈，按最差情况（先止损）处理，或标记 ambiguous。
- 参数中记录该规则。

---

## 5. 订单与持仓模拟

### 5.1 订单

```ts
interface SimOrder {
  id: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  qty: number;
  requestedPrice?: number;
  filledPrice?: number;
  status: 'filled' | 'rejected' | 'canceled';
  ts: number;
  reason?: string;
}
```

### 5.2 成交价

```text
effectivePrice = basePrice * (1 ± slippage)
buy:  basePrice * (1 + slippageBps/10000)
sell: basePrice * (1 - slippageBps/10000)
```

手续费：

```text
fee = filledPrice * qty * feeRate
```

从现金或平仓盈亏中扣除，记账明确。

### 5.3 现货模型

- 只能买入可用 quote，卖出可用 base。
- 无杠杆、无资金费、无强平。
- 支持简单多头策略；V1 可不做现货卖空。

### 5.4 USDT 永续模型

- 名义仓位 = qty * price。
- 初始保证金 ≈ 名义 / leverage（再按交易所规则近似）。
- 维持保证金与强平价使用可配置近似公式（文档化，不伪装成交易所 100% 一致）。
- 资金费：按 `fundingRateMode` 在持仓期间定期扣付。
- 多空均可（策略允许时）。

强平：

- 权益触及维持保证金阈值 → 强制平仓 → 记录 `liquidation` 交易。

---

## 6. 信号接入

```ts
interface StrategySignal {
  ts: number;
  action: 'open_long' | 'open_short' | 'close' | 'hold';
  strength?: number;
  meta?: Record<string, unknown>;
}
```

规则：

- 信号时间必须对齐 bar 时间模型。
- 禁止使用未来 bar 的指标值。
- 策略引擎产出信号；回测引擎不内嵌特定策略逻辑。

---

## 7. 绩效指标

最少输出：

| 指标 | 说明 |
|---|---|
| totalReturn | 总收益率 |
| netProfit | 净利润 |
| maxDrawdown | 最大回撤 |
| winRate | 胜率 |
| avgRr / payoff | 盈亏比相关 |
| profitFactor | 毛利 / 毛亏 |
| sharpeRatio | 需声明收益采样周期与无风险利率假设 |
| tradeCount | 交易次数 |
| avgHoldingTime | 平均持仓时间 |

权益曲线：按 bar 或按成交事件采样，写入 `equity_curve.jsonl`。

---

## 8. 产物与复现

### 8.1 文件

```text
data/backtest/{runId}/
  summary.json
  equity_curve.jsonl
  trades.jsonl
  params.json
```

`summary.json` 与 DB `metricsJson` 保持一致字段。

### 8.2 复现要求

同 `params` + 同 `dataVersion` + 同引擎版本 ⇒ 同结果。

若滑点含随机性，必须固定 `seed`。

---

## 9. 样本内 / 样本外

支持将区间切分为：

- In-Sample：参数拟合或策略开发区间
- Out-of-Sample：仅评估

UI 可对比两段指标；引擎提供分段运行或一次运行后切片统计。

---

## 10. 验收标准（对应 TASKS）

- [ ] 指定策略可完成历史回测
- [ ] 手续费、滑点计入结果
- [ ] 永续可计入资金费
- [ ] 无未来数据泄漏（默认 next_open）
- [ ] 重复运行结果一致
- [ ] 可查看每笔模拟交易
- [ ] 可查看收益与风险指标
- [ ] 参数与数据版本完整保存

---

## 11. 非目标（Phase 4）

- 盘口级 L2 回测
- 部分成交与排队模型
- 跨所套利仿真
- 与实盘交易所撮合 100% 一致
- AI 自动改参刷曲线

---

## 12. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DATA_MODEL.md](./DATA_MODEL.md)
- [AI_AGENT.md](./AI_AGENT.md)
- [TASKS.md](./TASKS.md)
