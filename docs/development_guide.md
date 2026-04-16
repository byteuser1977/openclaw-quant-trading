# OpenClaw Quant Trading - 开发指南

**版本**: 0.1.0
**最后更新**: 2026-03-24
**Phase**: 2 Sprint 1

---

## 📦 项目概述

这是一个基于 **OpenClaw** 和 **Freqtrade** 的量化交易技能包。提供完整的策略开发、回测、参数优化、风险管理能力。

### 核心技能模块

| 模块 | 职责 | 状态 |
|-----|------|------|
| **Strategy** | 策略创建、编译、验证 | 🚧 Phase 2 |
| **Backtesting** | 回测执行、结果分析 | 🚧 Phase 2 |
| **Hyperopt** | 参数自动优化 (Optuna) | 🚧 Phase 2 |
| **Data Management** | 数据下载 (ccxt)、验证、存储 | 🚧 Phase 2 |
| **Risk Management** | 仓位计算、动态止损、熔断 | 🚧 Phase 2 |
| **Exchange Adapter** | 统一交易所 API | 🚧 Phase 2 |
| **Persistence** | 数据持久化 (PostgreSQL/SQLite) | 🚧 Phase 2 |
| **Reporting** | 报告生成、可视化 | 🚧 Phase 2 |

---

## 🛠️ 技术栈

- **语言**: TypeScript 5.3+ (编译至 Node.js 18+)
- **运行时**: Node.js 18+
- **包管理**: npm 9+
- **测试框架**: Jest 29+ (ts-jest)
- **代码质量**: ESLint + Prettier
- **日志**: Winston
- **配置**: dotenv + JSON/YAML
- **数据库**: SQLite (开发) / PostgreSQL (生产)
- **缓存/队列**: Redis (可选)

---

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- Git

### 安装依赖

```bash
# 克隆仓库（如尚未）
git clone https://github.com/openclaw/openclaw-quant-trading.git
cd openclaw-quant-trading

# 安装依赖
npm ci
```

### 开发模式

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 自动修复 lint 问题
npm run lint:fix

# 运行测试
npm test

# 监听模式运行测试
npm run test:watch

# 查看测试覆盖率
npm run test:cov

# 构建项目
npm run build

# 开发热重载（使用 ts-node-dev）
npm run dev
```

### 构建

```bash
# 清理并构建
npm run clean && npm run build

# 输出文件在 dist/ 目录
```

---

## 📁 项目结构

```
openclaw-quant-trading/
├── src/
│   ├── core/              # 核心框架
│   │   ├── config.ts      # 配置管理
│   │   ├── logger.ts      # 日志系统
│   │   └── errors.ts      # 错误处理
│   ├── skills/            # 技能模块
│   │   ├── strategy/      # 策略模板
│   │   ├── backtesting/   # 回测引擎
│   │   ├── hyperopt/      # 参数优化
│   │   ├── data/          # 数据管理
│   │   ├── risk/          # 风险管理
│   │   ├── exchange/      # 交易所适配
│   │   ├── persistence/   # 数据持久化
│   │   └── reporting/     # 报告生成
│   ├── utils/             # 工具函数
│   └── index.ts           # 主入口
├── tests/
│   ├── unit/              # 单元测试
│   │   └── core/          # 核心模块测试
│   ├── integration/       # 集成测试
│   └── fixtures/          # 测试 fixtures
├── configs/               # 配置文件
│   ├── default.json
│   ├── development.json
│   ├── testing.json
│   └── production.json
├── docs/                  # 文档
├── scripts/               # 构建/部署脚本
├── memory/                # Agent 记忆
├── .github/workflows/     # CI/CD
├── tsconfig.json
├── jest.config.js
├── .eslintrc.js
└── package.json
```

---

## 🔧 核心配置

### 配置系统 (`src/core/config.ts`)

支持多环境配置 + 环境变量覆盖。

#### 加载优先级

1. 默认配置 (`defaultConfig`)
2. JSON 配置文件 (`configs/{env}.json`)
3. 环境变量 (`OPENCLAW_QUANT_*`)

#### 使用示例

```typescript
import { initConfig, getConfig, getConfigValue } from './core/config';

// 初始化（自动加载 .env）
const config = initConfig('development');

// 获取完整配置
const fullConfig = getConfig();
console.log(fullConfig.api.port);

// 获取指定字段
const dbHost = getConfigValue<string>('database.host');

// 验证配置
const validation = validateConfig();
if (!validation.valid) {
  console.error('Missing config:', validation.errors);
}
```

#### 环境变量格式

```
OPENCLAW_QUANT_API_PORT=8080
OPENCLAW_QUANT_DATABASE_HOST=localhost
OPENCLAW_QUANT_LOGGING_LEVEL=debug
```

---

### 日志系统 (`src/core/logger.ts`)

基于 Winston，支持结构化 JSON 日志。

#### 使用示例

```typescript
import { initLogger, getLogger, Logger } from './core/logger';

// 初始化全局日志器
initLogger({ level: 'info' });

// 获取日志实例
const logger = getLogger('my-module');

// 各等级日志
logger.trace('Trace message', { traceId: 'abc' });
logger.debug('Debug info', { userId: 123 });
logger.info('Info message', { action: 'create', resource: 'strategy' });
logger.warn('Warning!', { risk: 'high' });
logger.error('Error occurred', error, { code: 500 });
logger.fatal('Fatal error!', error, { critical: true });

// 子日志器（自动携带上下文）
const childLogger = logger.child('backtesting');
childLogger.info('Backtest started', { backtestId: 'xyz' });
```

#### 配置项

| 选项 | 说明 | 默认 |
|-----|------|------|
| `level` | 日志等级 | `info` |
| `format` | 输出格式 (`json`\|`pretty`) | `json` |
| `output` | 输出目标 (`console`\|`file`\|`both`) | `console` |
| `filePath` | 日志文件路径 | `logs/app.log` |
| `maxFiles` | 保留日志文件数 | `14` |
| `maxsize` | 单个文件大小 (bytes) | `10MB` |

---

### 错误处理 (`src/core/errors.ts`)

统一异常体系 + 重试装饰器 + 熔断器。

#### 错误类别

| 类别 | 范围 | 说明 |
|-----|------|------|
| `VALIDATION` | 1000-1999 | 参数、配置验证错误 |
| `STRATEGY` | 3000-3999 | 策略逻辑错误 |
| `DATABASE` | 4000-4999 | 数据库操作错误（可重试） |
| `EXCHANGE` | 5000-5999 | 交易所 API 错误（可重试） |
| `NETWORK` | 6000-6999 | 网络请求错误（可重试） |
| `FILE` | 7000-7999 | 文件系统错误 |
| `INTERNAL` | 8000-8999 | 内部系统错误 |
| `AUTH` | 9000-9999 | 认证/授权错误 |

#### 使用示例

```typescript
import {
  OpenClawError,
  ValidationError,
  NetworkError,
  retry,
  CircuitBreaker,
  ErrorCategory
} from './core/errors';

// 抛出特定错误
throw new ValidationError('Invalid parameter', 'timeframe', '5m');

// 可重试操作（装饰器）
class ExchangeService {
  @retry({
    maxRetries: 3,
    strategy: RetryStrategy.EXPONENTIAL,
    baseDelayMs: 1000
  })
  async fetchohlcv(pair: string): Promise<any> {
    // 可能失败的网络请求
    return await ccxt.fetchOHLCV(pair);
  }
}

// 熔断器
const breaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 60000
});

await breaker.execute(async () => {
  return await exchange.fetchBalance();
});
```

---

## 🧪 测试

### 运行测试

```bash
# 所有测试 + 覆盖率
npm test

# 仅单元测试
npm run test:unit

# 仅集成测试
npm run test:integration

# 监听模式
npm run test:watch

# 覆盖率报告在 coverage/ 目录
```

### 覆盖率目标

- **全局**: >= 80% (branches, functions, lines, statements)
- **核心模块**: >= 90%

### 编写测试

```typescript
// tests/unit/example.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SomeClass } from '../../src/core/some-module';

describe('SomeClass', () => {
  let instance: SomeClass;

  beforeEach(() => {
    instance = new SomeClass();
  });

  it('should do something', () => {
    const result = instance.method();
    expect(result).toBe(expected);
  });
});
```

### Fixtures

使用 `tests/fixtures/` 目录存储共享测试数据：

```typescript
import { validConfig } from '../fixtures/config.fixture';
```

---

## 🔍 类型检查与代码质量

### TypeScript

```bash
# 检查类型
npm run typecheck
```

### ESLint

```bash
# 运行 lint
npm run lint

# 自动修复
npm run lint:fix
```

### Prettier

代码格式化在 CI 中自动执行，本地可使用：

```bash
npx prettier --write src/
```

---

## 📝 贡献规范

### Git 工作流

1. 从 `main` 创建功能分支
2. 开发 + 测试 + lint + typecheck
3. 提交（遵循 Conventional Commits）
4. 创建 Pull Request
5. CI 通过后 review & merge

### Commit 规范

```
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
test: 测试相关
refactor: 重构
chore: 构建/工具更新
```

示例:

```bash
git commit -m "feat(strategy): 添加 MACD 指标计算"
```

---

## 🏗️ 构建与打包

### 构建命令

```bash
# 清理并构建
npm run clean && npm run build

# 监听模式
npm run build:watch
```

### 输出

构建后，TypeScript 编译输出至 `dist/` 目录，包含：

- `index.js` - 主入口
- `index.d.ts` - 类型声明
- `core/`, `skills/`, `utils/` - 模块文件

### 发布准备

确保 `dist/` 在 `.npmignore` 或 `package.json` 的 `files` 字段中包括。

---

## 🔐 安全与最佳实践

### 敏感信息

- **绝不** 提交 `.env` 或密钥文件
- 使用 `.env.local` 本地覆盖
- 生产环境使用飞书/云平台密钥管理

### 错误处理

- 使用 `errors.ts` 定义的异常类
- 网络/交易所错误标记 `retryable: true`
- 记录错误堆栈到日志

### 日志

- **不** 记录敏感数据（密码、密钥、PII）
- 使用结构化日志（JSON）
- 区分环境：生产环境设为 `info` 级别

---

## 📊 性能考虑

### 回测性能

- 目标: 1M bars/min (单 worker)
- 使用 DataFrame 行推进（保持简单，后续向量化）
- 启用数据缓存（HDF5/Parquet）

### 内存管理

- Hyperopt 限制 trial 数量
- 每轮清理内存
- 大型数据集流式处理

---

## 🧩 扩展技能

### 新增技能模块

1. 在 `src/skills/` 创建新目录
2. 实现 `index.ts` 导出主要类/函数
3. 在主入口 `src/index.ts` 导出
4. 在 `docs/` 添加技能文档
5. 编写单元测试于 `tests/unit/skills/`

### 示例骨架

```typescript
// src/skills/myskill/index.ts
export interface MySkillConfig {
  // ...
}

export class MySkill {
  constructor(private config: MySkillConfig) {}

  async execute(): Promise<void> {
    // 实现
  }
}

export function createMySkill(config: MySkillConfig): MySkill {
  return new MySkill(config);
}
```

---

## 🔗 相关资源

- **Freqtrade 官方**: https://freqtrade.io/
- **OpenClaw 文档**: https://docs.openclaw.ai
- **API 规范**: `docs/api_spec.json`
- **架构设计**: `docs/architecture.md`
- **风险管理设计**: `docs/risk_management_design.md`
- **错误处理设计**: `docs/error_handling_design.md`

---

## ❓ 常见问题

### Q: 如何添加新的交易所支持？

A: 使用 `ccxt` 库，所有交易所已统一接口。在 `ExchangeAdapter` 中配置参数即可。

### Q: TA-Lib 安装问题？

A: 建议使用预编译 wheel 或 Docker。开发阶段可软回退为纯 JS 实现。

### Q: 如何调试回测？

A: 使用 `logger.debug()` 记录详细步骤；配置 `logging.format=pretty`。

### Q: 多用户数据隔离？

A: 前端传递 `user_id`，后端所有查询强制附加 `WHERE user_id = ?`。

---

## 🎯 Phase 2 路线图

| Sprint | 目标 | 时长 |
|--------|------|------|
| **Sprint 1** | 基础框架（config, logger, errors, tests, CI） | 3d ✅ |
| **Sprint 2** | Strategy Skill（参数系统、指标计算） | 5d |
| **Sprint 3** | Data Skill（数据下载、验证、存储） | 4d |
| **Sprint 4** | Backtesting Core（回测引擎、订单模拟） | 6d |
| **Sprint 5** | Hyperopt + Test（Optuna 集成） | 5d |
| **Sprint 6** | Risk + Reporting（仓位、熔断、统计） | 4d |
| **Sprint 7** | 文档与示例（教程、API 文档） | 3d |

---

## 📄 许可证

MIT © OpenClaw Team
