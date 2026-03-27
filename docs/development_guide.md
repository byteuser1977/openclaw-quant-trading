# Development Guide - Quant Skill Developer

## 📚 项目概述

本项目围绕量化交易技能栈构建，目标是实现 **安全、可靠、可扩展** 的全链路交易系统。主要模块包括:
- **Core**: 配置、日志、错误、Vault、Allowlist
- **Skills**: Strategy、Backtesting、Hyperopt、Data Management、Risk Management、Exchange Adapter
- **Infrastructure**: CI/CD、Docker、测试

---

## 🔐 安全层 (Vault & Allowlist)

### Vault (`src/core/vault.ts`)
- 使用 **AES‑256‑GCM** 加密密钥
- 支持 **作用域** (`SecretScope`) 隔离：`EXCHANGE`、`DATABASE`、`NOTIFICATION`、`GLOBAL`
- 支持 **端点白名单**，仅在允许的 URL 上解密
- 自动 **密钥轮换提醒** (`rotate()`)
- 审计日志记录所有 **存取操作**

### Allowlist (`src/core/allowlist.ts`)
- 基于 **URL 通配符** (`*`、`?`) 与 **HTTP 方法** 的白名单
- 可选 **速率限制** (`rateLimit`) 防止滥用
- `permits(url, method, meta)` 返回 `{allowed: boolean, reason?: string}`
- `loadRules(rules)` 动态加载规则，`exportRules()` 导出当前配置

### 集成示例 (`src/skills/exchange/adapter.ts`)
- 在 `ExchangeAdapter` 中通过 `Allowlist.permits` 检查请求合法性
- 通过 `Vault.decrypt` 自动注入 API Key
- 所有网络请求均记录审计日志

---

## 📦 数据管理 (`src/skills/data/index.ts`)

### 功能概览
- **ccxt 集成**：支持所有交易所 (`ccxt.exchanges`)
- **Vault 注入**：自动读取交易所 API Key/Secret
- **OHLCV 下载**：单次或批量下载
- **数据验证**：缺失、重复、异常、时间缺口检测
- **数据清洗**：去重、过滤、排序、填补缺口
- **工具函数**：`getSupportedExchanges()`、`isSymbolSupported()`

### 关键类
- `DataManager`
  - `downloadOHLCV`
  - `downloadOHLCVBatched`
  - `validateData`
  - `cleanData`
  - `fillGaps`

---

## ⚖️ 风险管理 (`src/skills/risk/index.ts`)

### 三层防护
1. **仓位计算** (Layer 1)
   - `fixed_ratio`, `fixed_amount`, `kelly`, `kelly_fraction`
2. **动态止损** (Layer 2)
   - `fixed`, `trailing`, `atr`, `hybrid`
3. **系统熔断** (Layer 3)
   - 日/周亏损、连续亏损、最大回撤阈值

### 关键接口
- `calculatePositionSize(method, params)`
- `calculateStoploss(type, params)`
- `checkCircuitBreaker(params)`
- `getRiskEvents()` / `clearEvents()`

### 事件日志
- 每一次风险决策都会记录 `RiskEvent`，包括时间戳、类型、严重程度、详情。

---

## 📦 代码结构
```
src/
  core/        # Vault, Allowlist, Logger, Config, Errors, Worker
  skills/
    strategy/   # Strategy 编译、参数空间、回测
    backtesting/ # Backtest 执行与结果处理
    hyperopt/   # 参数优化
    data/       # DataManager (ccxt + 验证)
    risk/       # RiskManager (仓位、止损、熔断)
    risk/integration.ts  # RiskIntegration (策略集成层)
    exchange/   # ExchangeAdapter (Vault + Allowlist)
    persistence # PersistenceManager (飞书 Bitable 集成)
    reporting/  # ReportingManager (报告生成、统计)
```

---

## 💾 数据持久化 (`src/skills/persistence/index.ts`)

### 功能概览
- **飞书多维表格集成**：将交易数据写入协作表格
- **三张表映射**：
  - `tblFgMYmwl1mvRt8` (交易记录)
  - `tblQ0zgTAM5Gx93z` (绩效指标)
  - `tblBGFCTgZ16sIbB` (警报历史)
- **批量操作**：支持批量创建交易记录和风险告警
- **查询**：支持分页和简单筛选

### 关键类
- `PersistenceManager`
  - `saveTrade(record)` / `batchSaveTrades(records)`
  - `savePerformance(metric)`
  - `saveAlert(alert)` / `batchSaveAlerts(alerts)`
  - `listTrades(options)` 查询交易

---

## 📊 报告生成 (`src/skills/reporting/index.ts`)

### 功能概览
- **统计计算**：基于交易数据计算胜率、盈亏比、夏普比率、最大回撤等
- **多格式输出**：Markdown（用于飞书文档）、CSV（用于 Excel 分析）
- **持久化集成**：自动从 `PersistenceManager` 加载交易数据
- **可定制**：可配置是否包含交易明细表、限制条数

### 关键类
- `ReportingManager`
  - `calculateStats(trades)` → `TradeStats`
  - `generateMarkdownReport(trades, options)`
  - `generateCSV(trades)`
  - `generateReportFromDatabase(options)` 便捷方法

---

## 🧪 单元测试

### 测试结构

```
tests/
  unit/
    core/           # Vault, Allowlist, Logger, Config, Errors, Worker
    skills/
      data/         # DataManager
      risk/         # RiskManager
      backtesting/  # BacktestEngine
      hyperopt/     # HyperoptEngine
      persistence/  # PersistenceManager (mocking needed)
      reporting/    # ReportingManager (mocking needed)
```

### 现有测试文件

| 模块 | 测试文件 | 状态 |
|------|---------|------|
| Vault | `tests/unit/core/vault.test.ts` | ✅ 12+ 用例 |
| Allowlist | `tests/unit/core/allowlist.test.ts` | ✅ 18+ 用例 |
| DataManager | `tests/unit/skills/data_manager.test.ts` | ✅ 数据验证/清洗/缺口填充 |
| RiskManager | `tests/unit/skills/risk_manager.test.ts` | ✅ 仓位计算、止损、熔断 |
| Backtesting | `tests/unit/skills/backtesting.test.ts` | ✅ 引擎基础功能 |
| Hyperopt | `tests/unit/skills/hyperopt.test.ts` | ✅ 采样、评分、早停逻辑 |

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定模块
npm test -- --testPathPattern=vault

# 生成覆盖率报告
npm run test:coverage
```

### Mock 策略

Backtesting 和 Hyperopt 需要提供策略函数 (`StrategyFunction`) 作为参数。在单元测试中，使用简单的模拟策略验证核心逻辑：

```typescript
const mockStrategy: StrategyFunction = async (ctx) => {
  if (ctx.pastData.length < 2) return null;
  const last = ctx.pastData[ctx.pastData.length - 1];
  const prev = ctx.pastData[ctx.pastData.length - 2];
  if (last.close > prev.close && ctx.state.position === 0) {
    return { symbol: 'BTC/USDT', side: 'BUY', price: last.close };
  }
  return null;
};
```

---

## 📊 测试覆盖率目标

- **核心模块 (Core)**: > 85%
- **技能模块 (Skills)**: > 80%
- **集成测试**: 关键路径 100%

> ⚠️ **当前问题**: Jest 配置与 `tsconfig.json` 的 `paths` 映射 (`@/*`) 可能存在冲突，部分测试在 CI 环境可能失败。正在统一配置中。

---

## 🧪 单元测试
- `tests/unit/core/vault.test.ts`、`allowlist.test.ts`
- `tests/unit/core/data_manager.test.ts` (新增)
- `tests/unit/core/risk_manager.test.ts` (待补充)

> 注意: 当前 Jest 配置与 `tsconfig` 存在冲突，后续将统一 `moduleNameMapper` 解决路径问题。

---

## 📅 下一步计划 (Phase 2 Sprint 4)
1. 完成 **RiskManager** 单元测试并实现 `risk_manager.test.ts`
2. 将 **DataManager** 与 **ExchangeAdapter** 完全集成，实现端到端数据流
3. 引入 **Worker Isolation**：在 `src/core/worker.ts` 中实现策略运行的 worker 线程
4. 完成 **CI/CD** 流水线：自动跑单元测试、代码质量检查、文档发布

---

## 📚 参考资源
- **Vault 设计**: docs/vault_design.md (待完善)
- **Allowlist 规范**: docs/allowlist_spec.md
- **Data Management**: docs/data_management_design.md
- **Risk Management**: docs/risk_management_design.md

---

*本文件将随项目迭代保持更新*