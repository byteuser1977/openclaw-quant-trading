# Changelog

All notable changes to OpenClaw Quant Trading Skills will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0-beta] - 2026-04-02 (Beta RC2)

### Added

- **Beta RC2 完整发布** - 首个稳定的公测版本，包含完整的策略开发与回测工作流
- 技能包打包系统 (`scripts/package.js`) 支持自动生成 `manifest.json`
- 5 个内置策略模板: MACross, RSI+MACD, DCA, Grid, ML Skeleton
- 8 个核心能力模块声明 (strategy, backtesting, hyperopt, risk, data, exchange, persistence, reporting)
- 配置 Schema 定义 (风险参数、回测金额、日志级别)
- 飞书多维表格集成作为持久化存储后端

### Fixed

#### 核心修复 (必须包含)

- **EMA 指标计算** - 修正初始化行为，前 N-1 值为 NaN，第 N 个使用 SMA 初始化，避免错误平均
- **Worker 隔离稳定性** - 创建独立 JS 脚本 `strategyWorker.js`，零依赖，参数解析支持 `--strategy value` 和 `--strategy=value`，输出缓冲使用 `setImmediate` 确保 I/O 完成
- **DataManager 数据过滤** - `cleanData()` 增加 `open` 字段有效性检查，更严格过滤无效 K 线
- **策略构建器一致性** - `toPascalCase()` 移除不必要 `.toLowerCase()`，保留原始大小写，生成符合 Freqtrade 规范的类名

#### 测试与类型修复 (15+ 处)

- 统一 Logger 类型使用 (`getLogger() → any`)
- ParameterSpace `build()` 类型断言修正
- Validator Condition 提取逻辑修复
- OHLCV 数据 `timestamp` 字段补充
- IndicatorProvider 异步支持 (`supports()`)
- `getInputArray` 安全字段访问
- STOCH 输出类型保护
- 模板导入/导出路径统一
- Backtesting `stoplossExit` 作用域修复
- 测试环境变量 `OPENCLAW_QUANT_MASTER_KEY`
- Allowlist 单例 `__clear` 辅助方法
- RiskManager API 扩展 (FixedRatio, Kelly)
- Persistence Feishu Mock 完全修复 (6/6 测试通过)

### Changed

- **项目结构** - 拆分 `dist/skill/` 为 `dist/skill-rc2/` 作为 Beta RC2 发布产物
- **打包脚本** - 容错模式编译 (`tsc` 允许类型错误但继续)，自动生成 manifest.json
- **测试策略** - 提高 Beta 覆盖率阈值到 55% (Statements), 42% (Branches), 50% (Functions), 55% (Lines)
- **Git 提交信息** - 标准化 `feat(scope): description` 格式

### Known Issues

- **Hyperopt 类型错误** (5 个测试失败) - `ParameterSet` vs `ParameterSpace` 不匹配，`sample()` 调用错误
- **Exchange 集成未完整** - `RiskIntegration` 类型缺失 `approved`, `executionParams`, `calculateStoploss`, `checkCircuitBreaker`
- **策略模板覆盖率低** - `rsi_macd.ts` 仅 18.18%，其他约 44-50%
- **TypeScript 编译警告** - 存在类型冲突，但容错模式下不影响运行时

---

## [1.0.0-alpha] - 2026-03-31 (Beta RC1)

### Added

- 初始 Beta 版本发布 (内部测试)
- 基础架构: Config, Logger, Errors, Vault, Allowlist, Worker
- Strategy Skill 完整功能 (Builder, Compiler, Validator, Indicators, Parameters)
- Backtesting 引擎 (逐K推进, Sharpe/回撤计算)
- Hyperopt 优化框架 (基于 Optuna)
- RiskManager 独立模块 (仓位计算, 动态止损, 熔断)
- Persistence 飞书多维表格集成
- Reporting 报告生成模块 (Equity curve, 分布图)
- 25 个测试文件，平均覆盖率 ~80%

### Known Issues

- EMA 计算前 N-1 值错误平均
- Worker 隔离启动不稳定
- Data Manager 缺少 `open` 字段检查
- Builder 类名大小写不一致

---

## [Unreleased]

### Planned

- 完成 Exchange 实盘交易集成
- 修复 Hyperopt ParameterSet 类型系统
- 增加策略模板分支覆盖率
- 消除 TypeScript 编译警告
- 支持更多指标 (BBands, RSI, MACD 更多参数组合)
- 添加 PyTorch/TensorFlow 集成选项 (ML 策略增强)
- 优化文档和用户示例

---

**Note**: [Unreleased] 条目用于记录未来版本的规划功能。当前最新正式版本为 `1.0.0-beta` (RC2)。
