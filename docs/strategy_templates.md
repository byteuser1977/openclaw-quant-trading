# Strategy Templates Guide

## 📖 概述

本指南介绍 OpenClaw Quant 中的预置策略模板。所有模板均符合 Freqtrade `IStrategy` 接口规范，可通过 `StrategyBuilder` 或直接使用模板函数快速构建。

## 🎯 快速开始

### 基本使用

```typescript
import { createMACrossStrategy } from '../src/skills/strategy/templates';

// 创建模板
const template = createMACrossStrategy('My MA Cross', '5m', {
  fast_period: 12,
  slow_period: 26,
});

// 编译为 Python 策略
import { compileStrategy } from '../src/skills/strategy/compiler';
const compiled = compileStrategy(template);

console.log(compiled.code); // Python 代码
console.log(compiled.fileName); // "my_ma_cross.py"
```

### 使用 Builder API

```typescript
import { StrategyBuilder } from '../src/skills/strategy';

// 使用预设工厂方法
const builder = StrategyBuilder.createMACross('My Strategy', 10, 21, '1h');
const compiled = builder.compile();

// 或使用模板的 builder
import { buildMACrossStrategy } from '../src/skills/strategy/templates';
const builder2 = buildMACrossStrategy(15, 50, '4h');
```

## 📊 模板列表

### 1. MA Cross (macross)

**难度**: ⭐ (入门)

**描述**: 经典的趋势跟踪策略。当 Fast MA 上穿 Slow MA 时做多，下穿时平仓。

**适用市场**: 趋势明显的市场（单边或强趋势）

**风险提示**: 在震荡市中会产生多次假信号（whipsaw），导致频繁交易和亏损。

**参数说明**:

| 参数 | 类型 | 默认 | 优化范围 | 说明 |
|------|------|------|----------|------|
| `fast_period` | int | 10 | 5-50 | 快速 EMA 周期 |
| `slow_period` | int | 21 | 10-200 | 慢速 EMA 周期 |
| `stoploss` | decimal | -0.1 | -0.2 ~ -0.02 | 止损百分比 |
| `trailing_stop` | bool | true | - | 是否启用追踪止损 |
| `trailing_stop_positive` | decimal | 0.02 | 0.01-0.1 | 触发追踪的盈利阈值 |
| `trailing_stop_positive_offset` | decimal | 0.04 | 0.01-0.2 | 追踪止损偏移 |

**示例**:

```typescript
const template = createMACrossStrategy('MA Cross', '5m', {
  fast_period: 12,
  slow_period: 26,
});
```

---

### 2. RSI + MACD (rsi_macd)

**难度**: ⭐⭐ (中等)

**描述**: 结合 RSI 均值回归和 MACD 趋势确认。RSI 超卖 + MACD 金叉 → 做多；RSI 超买 + MACD 死叉 → 做空（可选）。

**适用市场**: 波动较大且有趋势的市场

**风险提示**: 两个指标需同时触发，信号频率较低。在强趋势中 RSI 可能长时间处于极端区域。

**参数说明**:

| 参数 | 类型 | 默认 | 优化范围 | 说明 |
|------|------|------|----------|------|
| `rsi_period` | int | 14 | 7-21 | RSI 计算周期 |
| `rsi_oversold` | int | 30 | 20-40 | 超卖阈值 |
| `rsi_overbought` | int | 70 | 60-80 | 超买阈值 |
| `macd_fast` | int | 12 | 8-20 | MACD 快线周期 |
| `macd_slow` | int | 26 | 20-40 | MACD 慢线周期 |
| `macd_signal` | int | 9 | 5-15 | MACD 信号线周期 |
| `stoploss` | decimal | -0.15 | -0.25 ~ -0.05 | 止损百分比 |
| `use_short` | bool | true | - | 是否启用做空信号 |

**示例**:

```typescript
const template = createRsiMacdStrategy('RSI MACD', '1h', {
  rsi_period: 14,
  rsi_oversold: 25,
  rsi_overbought: 75,
  use_short: false, // 只做多
});
```

---

### 3. Grid Trading (grid)

**难度**: ⭐⭐ (中等)

**描述**: 网格交易策略。在价格区间内自动挂单，低买高卖，赚取波动收益。类似做市策略。

**适用市场**: 震荡市（range-bound）

**风险提示**: 在强趋势市场中可能全部仓位集中在一边（全是买单或全是卖单），导致巨大浮亏。需设置止损和最大仓位限制。

**参数说明**:

| 参数 | 类型 | 默认 | 优化范围 | 说明 |
|------|------|------|----------|------|
| `grid_levels` | int | 10 | 5-30 | 网格层数 |
| `grid_spacing_pct` | decimal | 1.0 | 0.5-5.0 | 网格间距（百分比） |
| `base_price_mode` | categorical | 'auto' | auto/manual | 基准价格计算模式 |
| `base_price` | decimal | - | - | 手动基准价格（mode=manual 时使用） |
| `max_position_size` | decimal | 1000 | 100-10000 | 最大仓位（计价货币） |
| `stoploss` | decimal | -0.15 | -0.3 ~ -0.05 | 整体止损 |
| `use_trailing_stop` | bool | false | - | 是否启用追踪止损 |

**特殊说明**: 网格策略需要自定义订单管理逻辑（`populate_indicators` 中计算网格价格），模板仅提供框架。

---

### 4. Dollar Cost Averaging (dca)

**难度**: ⭐ (入门)

**描述**: 定期定额买入（DCA）。不考虑价格，每隔固定时间投入固定金额。适合长期定投。

**适用市场**: 所有市场，尤其适合熊市积累

**风险提示**: 不追求短期收益，需要耐心持有。可能过早耗尽投资额度。

**参数说明**:

| 参数 | 类型 | 默认 | 优化范围 | 说明 |
|------|------|------|----------|------|
| `interval_hours` | int | 24 | 1-168 | 定投间隔（小时） |
| `amount_per_interval` | decimal | 100 | 10-1000 | 每次投入金额 |
| `max_total_investment` | decimal | 5000 | 500-50000 | 总投资上限 |
| `target_profit_pct` | decimal | 20.0 | 5.0-50.0 | 目标收益率（触发平仓） |
| `max_hold_days` | int | 365 | 30-365 | 最长持有天数 |
| `use_stop_loss` | bool | false | - | 是否启用止损 |
| `stop_loss_pct` | decimal | -10.0 | -20.0 ~ -5.0 | 止损百分比 |

**特殊说明**: DCA 需要基于时间的买入逻辑，需在 `populate_entry_trend` 中实现时间检查。

---

### 5. Machine Learning Skeleton (ml_skeleton)

**难度**: ⭐⭐⭐ (高级)

**描述**: 机器学习策略骨架。提供特征工程、训练/预测生命周期钩子。用户需自行实现模型训练和预测逻辑。

**支持模型**: Random Forest, XGBoost, LightGBM, Custom

**适用场景**: 自定义机器学习模型集成

**风险提示**: 需要充分的数据科学知识和回测验证。避免过拟合。

**参数说明**:

| 参数 | 类型 | 默认 | 优化范围 | 说明 |
|------|------|------|----------|------|
| `model_type` | categorical | 'xgboost' | random_forest/xgboost/lightgbm/custom | 模型类型 |
| `retrain_interval_days` | int | 7 | 1-30 | 重新训练间隔 |
| `train_lookback_days` | int | 365 | 30-730 | 训练数据回看天数 |
| `prediction_threshold` | decimal | 0.6 | 0.5-0.9 | 入场概率阈值 |
| `target_periods` | int | 12 | 1-48 | 预测目标（多少根K线后的收益） |
| `features` | string[] | (见代码) | - | 特征列表 |
| `use_atr_stop` | bool | true | - | 是否使用 ATR 止损 |
| `atr_multiplier` | decimal | 2.0 | 1.0-5.0 | ATR 乘数 |

**默认特征列表**:

- `rsi_14`
- `macd` (MACD 线)
- `macd_signal` (信号线)
- `bb_upper_20` (布林带上轨)
- `bb_lower_20` (布林带下轨)
- `volume_ratio` (成交量比率)
- `returns_1h` (1小时收益率)
- `returns_4h` (4小时收益率)

**自定义实现**: 用户需重写 `on_train()` 和 `on_predict()` 方法：

```python
def on_train(self, dataframe: DataFrame, metadata: Dict, **kwargs):
    # 用户训练逻辑
    # 可使用 self.parameters['model_type'] 选择模型
    # 保存模型到 self.model
    pass

def on_predict(self, dataframe: DataFrame, metadata: Dict, **kwargs) -> Series:
    # 返回预测概率 (0-1)
    probabilities = self.model.predict_proba(dataframe[self.parameters['features']])
    return probabilities[:, 1]  # 做多概率
```

---

## 🛠️ Hyperopt 参数优化

所有策略模板均内置 **Hyperopt 参数空间定义**，可直接用于自动优化：

```typescript
import { getParameterSpace } from '../src/skills/strategy/templates/macross';

const space = getParameterSpace();
// space 是 ParameterSpace 对象，可用于随机采样或优化搜索
```

### 参数空间格式

每个参数包含：

```typescript
{
  type: 'int' | 'decimal' | 'boolean' | 'categorical',
  default: any,
  low?: number,      // 数值类型
  high?: number,     // 数值类型
  step?: number,     // 数值类型，步长
  choices?: any[],   // categorical
  hyperopt?: {       // Hyperopt 优化配置
    type: 'int' | 'float' | 'discrete',
    min: number,
    max: number,
    step?: number,
  }
}
```

---

## 🔍 模板注册表

所有模板在 `templates/index.ts` 中注册，可通过 `TEMPLATE_REGISTRY` 访问：

```typescript
import { listTemplates, getTemplate, getBuilder } from '../src/skills/strategy/templates';

// 列出所有模板
const all = listTemplates();
// [{ name: 'MA Cross', difficulty: 'beginner', ... }, ...]

// 获取特定模板
const macross = getTemplate('macross');

// 获取 builder 工厂
const builderFactory = getBuilder('macross');
const builder = builderFactory({ fast_period: 15 });
```

---

## 📈 使用示例

### 完整回测流程

```typescript
import { getMACrossTemplate } from '../src/skills/strategy/templates';
import { compileStrategy } from '../src/skills/strategy/compiler';
import { BacktestEngine } from '../src/skills/backtesting';
import { DataManager } from '../src/skills/data';

async function runBacktest() {
  // 1. 获取模板并编译
  const template = getMACrossTemplate({ fast_period: 12, slow_period: 26 });
  const strategy = compileStrategy(template);

  // 2. 下载数据
  const dataManager = new DataManager();
  const ohlcv = await dataManager.downloadOHLCV('binance', 'BTC/USDT', '5m', '2024-01-01', '2024-03-01');

  // 3. 运行回测
  const engine = new BacktestEngine();
  const results = await engine.run(strategy, ohlcv);

  // 4. 输出报告
  console.log(`Sharpe: ${results.sharpe}`);
  console.log(`Max Drawdown: ${results.maxDrawdown}%`);
  console.log(`Total Return: ${results.totalReturn}%`);
}
```

### 策略参数优化

```typescript
import { HyperoptEngine } from '../src/skills/hyperopt';
import { getParameterSpace } from '../src/skills/strategy/templates/macross';
import { getMACrossTemplate } from '../src/skills/strategy/templates';

async function optimize() {
  const space = getParameterSpace();
  const hyperopt = new HyperoptEngine();

  const bestParams = await hyperopt.optimize(
    space,
    async (params) => {
      const template = getMACrossTemplate(params as any);
      const strategy = compileStrategy(template);
      // 运行回测并返回Sharpe比率
      const results = await runBacktest(strategy);
      return results.sharpe;
    },
    {
      maxEvals: 100,
      timeoutMs: 3600000,
    }
  );

  console.log('Best parameters:', bestParams);
}
```

---

## 📝 最佳实践

### 选择合适的策略

1. **趋势市场** → MA Cross, RSI+MACD
2. **震荡市场** → Grid Trading
3. **长期定投** → DCA
4. **自定义模型** → ML Skeleton

### 风险管理

- 所有策略应设置 **stoploss**（负值，如 -0.1 表示 10% 止损）
- 启用 **trailing_stop** 保护盈利
- 对于 Grid 策略，严格控制 `max_position_size`
- 定期检查 **回撤** 和 **夏普比率**

### 参数优化

- 使用 `getParameterSpace()` 获取优化边界
- 避免过度优化（overfitting）：使用 **walk-forward analysis** 或 **cross-validation**
- 优化目标：**Sharpe Ratio** > 1, **Max Drawdown** < 20%

### 实盘注意事项

- 先在 Paper Trading（模拟）运行至少 1 个月
- 逐步增加仓位
- 监控交易日志（Persistence → Bitable）
- 设置熔断（Circuit Breaker）保护

---

## 🐛 故障排除

### 策略不产生信号

- 检查指标计算公式是否正确
- 验证 entry/exit 条件的逻辑（AND/OR 组合）
- 确认数据时间对齐（timezone, timeframe）

### Python 编译失败

- 生成的 Python 代码应符合 Freqtrade `IStrategy` 接口
- 检查 `populate_*` 方法是否正确返回 `DataFrame`
- 确保所有 TA-Lib 函数调用正确

### Hyperopt 不收敛

- 参数空间可能太大，缩小范围
- 增加 `max_evals`
- 检查目标函数是否稳定（回测结果是否可靠）

---

## 🔗 相关文档

- [Development Guide](./development_guide.md)
- [API Specification](./api_spec.json)
- [Freqtrade Documentation](https://www.freqtrade.io/en/stable/)
- [OpenClaw Skill SDK](../../docs/)

---

**维护**: quant-skill-developer agent
**版本**: v1.0
**更新**: 2026-03-30
