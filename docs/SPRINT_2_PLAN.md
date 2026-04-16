# Sprint 2 详细计划: Strategy Skill

**开始日期**: 2026-03-24
**预计工期**: 5 天
**目标**: 实现策略模板系统的核心功能，支持参数化策略定义、指标计算、代码生成与验证

---

## 📦 Sprint 2 交付物

| 任务 | 文件 | 状态 |
|-----|------|------|
| 2.1 参数系统 | `src/skills/strategy/parameters.ts` | 🚧 |
| 2.2 指标计算框架 | `src/skills/strategy/indicators.ts` | 🚧 |
| 2.3 策略编译器 | `src/skills/strategy/compiler.ts` | 🚧 |
| 2.4 策略验证器 | `src/skills/strategy/validator.ts` | 🚧 |
| 2.5 单元测试 | `tests/unit/skills/strategy/*.test.ts` | 🚧 |
| 2.6 文档更新 | `docs/api_spec_strategy.json`, `development_guide.md` | 🚧 |

---

## 🎯 任务详情

### Task 2.1: 参数系统实现

**目标**: 实现完整的参数定义、验证、序列化系统，支持 Hyperopt 参数空间

**子任务**:
- [ ] 定义 `Parameter` 抽象基类 (interface)
- [ ] 实现 `IntParameter` (min, max, step)
- [ ] 实现 `DecimalParameter` (min, max, precision)
- [ ] 实现 `BooleanParameter` (default)
- [ ] 实现 `CategoricalParameter` (options 数组)
- [ ] 实现 `ParameterSpace` 类（分组管理: buy, sell, roi, protection, common）
- [ ] 参数验证逻辑 (range, type)
- [ ] 序列化为 JSON Schema（用于 API 规范）
- [ ] 文档字符串 + 示例

**API 设计**:
```typescript
// 参数定义
const rsi_period = new IntParameter('rsi_period', 10, 30, step=2);
const stoploss = new DecimalParameter('stoploss', -0.2, -0.05, precision=0.001);
const use_trailing = new BooleanParameter('use_trailing', default=false);
const ma_type = new CategoricalParameter('ma_type', ['ema', 'sma', 'wma']);

// 参数空间
const space = new ParameterSpace();
space.addGroup('buy', { rsi_period, ma_type });
space.addGroup('sell', { rsi_period });
space.addGroup('roi', { stoploss });
```

**验收标准**:
- 所有参数类型可实例化并访问其值
- 参数验证抛出 `ValidationError`
- `toJSON()` 正确输出 API 规范格式
- 单元测试覆盖率 >= 90%

---

### Task 2.2: 指标计算框架

**目标**: 封装 TA-Lib 并提供统一的指标计算接口，支持软回退

**子任务**:
- [ ] 设计 `Indicator` 接口 (name, calculate(input: number[]): number[])
- [ ] 实现 `TA-Lib` 适配器 (`TA-Lib` 包装)
- [ ] 实现软回退 (soft-fallback) JS 版本（当 TA-Lib 未安装时）
- [ ] 常用指标实现 (至少 10 个):
  - RSI, MACD, EMA, SMA, WMA
  - ATR, Bollinger Bands, Stochastic, ADX
  - Volume indicators (OBV)
- [ ] 性能测试（对比 TA-Lib 与纯 JS）
- [ ] 文档 + 示例

**API 设计**:
```typescript
import { indicators } from './indicators';

const rsi = indicators.RSI(close,period=14);
const macd = indicators.MACD(close, fast=12, slow=26, signal=9);
const atr = indicators.ATR(high, low, close, period=14);
```

**验收标准**:
- 所有指标输出与 TA-Lib 官方实现一致 (误差 < 1e-6)
- 当 TA-Lib 缺失时自动降级到 JS 实现
- 单元测试使用 fixture OHLCV 数据验证
- 性能满足：1M bars 计算时间 < 10s

---

### Task 2.3: 策略编译器

**目标**: 将参数化策略配置编译为可执行 Python 代码（兼容 Freqtrade strategy interface）

**子任务**:
- [ ] 设计 `StrategyTemplate` 结构（指标、buy/sell 逻辑、参数）
- [ ] 实现 Python 代码生成器 (`PythonCodeGenerator`)
- [ ] 生成标准 Freqtrade 策略文件（包含 `populate_indicators`, `populate_buy_trend`, `populate_sell_trend`）
- [ ] 参数注入（将用户参数转换为 Python 变量）
- [ ] 动态导入机制（编译后动态加载 Python 模块）
- [ ] 输出文件管理（临时目录、清理策略）
- [ ] 单元测试验证生成的 Python 代码语法正确性

**API 设计**:
```typescript
const compiler = new StrategyCompiler();
const pythonCode = compiler.compile({
  name: 'MyStrategy',
  parameters: { rsi_period: 14, ma_type: 'ema' },
  indicators: ['RSI', 'EMA'],
  buyCondition: 'rsi < 30 and close < ema',
  sellCondition: 'rsi > 70'
});
// 输出到文件: /tmp/strategy_xyz.py
```

**验收标准**:
- 生成的 Python 代码可通过 `python -m py_compile` 验证
- 生成的策略可被 Freqtrade 加载（需要 Freqtrade 集成测试，Sprint 4）
- 参数替换正确（所有参数值被注入）
- 代码生成时间 < 100ms

---

### Task 2.4: 策略验证器

**目标**: 验证策略配置的完整性、语法正确性、逻辑一致性

**子任务**:
- [ ] 实现 `StrategyValidator` 类
- [ ] 必需方法检查（`populate_indicators`, `populate_buy_trend`, `populate_sell_trend`）
- [ ] Python 语法验证（`python -m py_compile`）
- [ ] 指标依赖分析（检查使用未定义的指标）
- [ ] 参数引用检查（buy/sell 条件中引用的参数必须在参数空间中）
- [ ] 返回结构化验证报告（`{valid: boolean, errors: string[]}`）

**API 设计**:
```typescript
const validator = new StrategyValidator();
const result = await validator.validate(strategyConfig);
if (!result.valid) {
  console.error(result.errors);
}
```

**验收标准**:
- 可检测 10+ 种常见配置错误（缺失方法、未知参数、指标未定义等）
- 验证耗时 < 500ms
- 返回清晰错误信息（行号、问题描述、修复建议）

---

### Task 2.5: 单元测试补充

**目标**: 为 Strategy Skill 模块提供 >80% 覆盖率测试

**子任务**:
- [ ] `tests/unit/skills/strategy/parameters.test.ts`
  - 参数类型测试 (int/decimal/boolean/categorical)
  - 验证边界测试
  - toJSON 序列化
- [ ] `tests/unit/skills/strategy/indicators.test.ts`
  - 每个指标使用 fixture 数据验证
  - 软回退模式测试
- [ ] `tests/unit/skills/strategy/compiler.test.ts`
  - 代码生成测试
  - 参数注入测试
  - 语法验证
- [ ] `tests/unit/skills/strategy/validator.test.ts`
  - 验证规则测试
  - 错误检测测试
- [ ] 覆盖率检查 (`npm test -- --coverage`)
- [ ] 性能测试 (`npm run test:perf`)

**测试数据**:
- 使用 `tests/fixtures/` 存放 OHLCV 样本（BTC/USDT 5m 数据集）
- 预设预期指标值（golden data）

---

### Task 2.6: 文档更新

**目标**: 补充 Strategy Skill API 文档和使用指南

**子任务**:
- [ ] 更新 `docs/api_spec.json` - 添加 Strategy 方法详细定义
- [ ] 更新 `docs/development_guide.md` - 添加参数系统、指标使用示例
- [ ] 创建 `docs/strategy_guide.md` - 策略开发用户指南
- [ ] 添加 3+ 示例策略代码 (MA Cross, RSI, MACD)
- [ ] 更新 `README.md` 链接到新文档

---

## 📊 技术决策

### 决策 1: TA-Lib vs 纯 JS 实现

**问题**: TA-Lib 安装复杂，可能不可用
**决策**: 使用 TA-Lib 作为首选，但实现 JS 软回退
**理由**: 性能优先，兼容性第二

### 决策 2: 策略编译器输出 Python

**问题**: Node.js 中动态执行 Python 需要进程间通信
**决策**: 仅生成 `.py` 文件，由外部（Sprint 4）执行
**理由**: 解耦编译器与执行引擎

### 决策 3: 参数存储格式

**问题**: 参数需持久化并支持 Hyperopt
**决策**: 使用 JSON Schema 序列化，存储在 PostgreSQL
**理由**: 兼容 API 规范，便于搜索和版本控制

---

## 🐛 风险与缓解

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| TA-Lib 本地不可用 | 无法运行测试 | 集成 TA-Lib 的 Docker 容器（开发环境）；实现 JS 软回退 |
| Python 生成语法错误 | 策略无法运行 | 集成 `py_compile` 验证 + 详细错误报告 |
| 参数系统复杂度高 | 延期 | 先实现最小可行（仅 int/decimal），后续迭代添加其他类型 |
| 指标性能不达标 | 回测慢 | 优化算法（向量化）；缓存中间结果 |
| Freqtrade 接口变动 | 编译输出不兼容 | 锁定 Freqtrade 版本；编写适配层 |

---

## 📈 成功标准

- ✅ 所有 6 个任务完成
- ✅ 单元测试覆盖率 >= 80%
- ✅ `npm test` 全部通过
- ✅ `npm run build` 无错误
- ✅ 文档更新完成，示例代码可运行
- ✅ API 规范 (`api_spec.json`) 包含 Strategy 方法定义

---

## 🔄 每日站会检查

| 日期 | 完成项 | 阻塞项 | 下一步 |
|-----|--------|--------|--------|
| Day 1 | 参数系统 + 指标框架 | TA-Lib 安装 | 开始编译器 |
| Day 2 | 编译器 + 验证器 | - | 集成测试 |
| Day 3 | 单元测试 | - | 文档编写 |
| Day 4 | 文档 + 示例 | - | 性能优化 |
| Day 5 | 最终验收 | - | 提交 PR |

---

**准备开始！** 🚀
