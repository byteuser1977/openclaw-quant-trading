# System Architecture - Quant Skills

**版本**: 1.0
**生成日期**: 2026-03-22
**基于**: Freqtrade 架构设计与 OpenClaw Skills 规范

---

## 📐 总体架构图

### 分层架构

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Web UI / CLI]
        API[OpenClaw API Gateway]
    end

    subgraph "Skills Layer"
        S1[Strategy Skill]
        S2[Backtesting Skill]
        S3[Hyperopt Skill]
        S4[Data Management Skill]
        S5[Risk Management Skill]
        S6[Exchange Adapter Skill]
        S7[Persistence Skill]
        S8[Reporting Skill]
    end

    subgraph "Shared Services"
        TASK[Async Task Queue<br/>Redis/Celery]
        AUTH[Auth & RBAC]
        LOG[Structured Logging]
        MON[Monitoring]
    end

    subgraph "Infrastructure"
        DB[(PostgreSQL<br/>交易数据)]
        CACHE[Redis<br/>缓存/队列]
        FILES[File Storage<br/>数据/报告]
        EXCH[Exchange APIs<br/>ccxt]
    end

    UI --> API
    API --> S1
    API --> S2
    API --> S3
    API --> S4
    API --> S5
    API --> S6
    API --> S7
    API --> S8

    S1 -.-> AUTH
    S2 -.-> TASK
    S3 -.-> TASK
    S4 -.-> TASK
    S2 -.-> LOG
    S3 -.-> LOG
    S1 -.-> MON

    S2 --> DB
    S7 --> DB
    S5 --> DB
    S6 --> EXCH
    S4 --> FILES
    S2 --> FILES
    S3 --> FILES

    TASK --> CACHE
    CACHE --> DB

    style S1 fill:#e1f5ff
    style S2 fill:#e1f5ff
    style S3 fill:#e1f5ff
    style S4 fill:#e1f5ff
    style S5 fill:#ffebee
    style S6 fill:#e8f5e9
    style S7 fill:#fff3e0
    style S8 fill:#f3e5f5
```

### 数据流图

```mermaid
sequenceDiagram
    participant U as User
    participant API as API Gateway
    participant S as Skill (e.g., Backtesting)
    participant T as Task Queue (Redis)
    participant W as Worker
    participant DB as PostgreSQL
    participant F as File Storage
    participant EX as Exchange

    U->>API: POST /skills/backtesting.run_backtest
    API->>API: Auth validation (Bearer Token)
    API->>S: Route to skill
    S->>DB: Create task record (status=running)
    S->>T: Enqueue task (task_id)
    S->>API: Return {task_id, status:"running"}
    API->>U: 202 Accepted

    loop Async Processing
        T->>W: Dequeue task
        W->>DB: Get strategy definition
        W->>F: Load OHLCV data
        W->>EX: (optional) Fetch additional data
        W->>W: Execute backtest simulation
        W->>DB: Save results
        W->>F: Write report files
        W->>DB: Update task (status=completed)
    end

    U->>API: GET /tasks/{task_id}
    API->>DB: Query task status
    DB->>API: {status:"completed", result_url}
    API->>U: 200 OK + result URL
```

---

## 🧩 技能模块依赖图

```mermaid
graph LR
    subgraph "Core Skills"
        STRAT[Strategy]
        BACK[Backtesting]
        HYPER[Hyperopt]
    end

    subgraph "Supporting Skills"
        DATA[Data Management]
        RISK[Risk Management]
        EXAD[Exchange Adapter]
        PERS[Persistence]
        REP[Reporting]
    end

    STRAT --> BACK
    STRAT --> HYPER
    BACK --> DATA
    BACK --> EXAD
    BACK --> PERS
    BACK --> REP
    HYPER --> BACK
    HYPER --> DATA
    BACK --> RISK
    EXAD --> PERS
    RISK --> PERS

    style STRAT fill:#bbdefb
    style BACK fill:#c8e6c9
    style HYPER fill:#ffecb3
```

**说明**:
- **Strategy** 是起点，生成可执行策略代码
- **Backtesting** 依赖 Data、Exchange、Persistence 执行回测
- **Hyperopt** 调用 Backtesting 多次进行参数搜索
- **Risk Management** 被 Backtesting 和 Strategy 同时调用
- **Reporting** 消费 Backtesting 结果生成报告

---

## 📊 策略开发与回测流水线

```mermaid
graph LR
    A[定义指标<br/>RSI/EMA] --> B[定义入场/出场条件]
    B --> C[编译策略 Python 文件]
    C --> D[下载历史数据<br/>BTC/USDT 5m]
    D --> E[配置参数<br/>stoploss=-0.1]
    E --> F[单次回测]
    F --> G{结果满意?}
    G -->|否| H[定义参数空间<br/>optimize rsi_period]
    H --> I[Hyperopt 自动优化]
    I --> J[获取最优参数]
    J --> E
    G -->|是| K[生成报告/图表]
    K --> L[Dry-run 模拟交易]
    L --> M[实盘交易]
```

---

## 🗃️ 数据库 ER 图

```mermaid
erDiagram
    STRATEGIES ||--o{ BACKTEST_RESULTS : has
    STRATEGIES {
        string id PK
        string name
        string timeframe
        json indicators
        json parameters
        datetime created_at
    }

    BACKTEST_RESULTS {
        string id PK
        string strategy_id FK
        string pair
        datetime start_date
        datetime end_date
        json performance_metrics
        datetime completed_at
    }

    BACKTEST_RESULTS ||--o{ TRADE_RECORDS : contains
    TRADE_RECORDS {
        string id PK
        string backtest_id FK
        string pair
        datetime open_time
        datetime close_time
        float open_rate
        float close_rate
        float amount
        float profit_ratio
    }

    OPTIMIZATIONS {
        string id PK
        string strategy_id FK
        string space_id
        json best_params
        float best_value
        datetime completed_at
    }

    ASYNC_TASKS {
        string id PK
        string skill_name
        string method_name
        string status
        json result
        datetime created_at
        datetime completed_at
    }

    STRATEGIES ||--o{ OPTIMIZATIONS : "1:N"
```

---

## 🔄 异步任务状态机

```mermaid
stateDiagram-v2
    [*] --> Queued
    Queued --> Running: Worker picks up
    Running --> Completed: Success
    Running --> Failed: Unhandled exception
    Running --> Cancelled: User cancel
    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]

    note right of Running
      Long-running operations:
      - backtest (minutes-hours)
      - hyperopt (hours-days)
      - data download (minutes)
    end note
```

---

## 🔐 安全架构

```mermaid
graph TB
    subgraph "Authentication"
        AUTH[OAuth 2.0 / Session]
        RBAC[Role-Based Access Control]
    end

    subgraph "API Gateway"
        GW[Rate Limiter<br/>100 req/min]
        VAL[Input Validation<br/>JSON Schema]
    end

    subgraph "Skills"
        S1[Skill]
        S2[Skill]
    end

    subgraph "Data Protection"
        ENCRYPT[Encryption at Rest<br/>AES-256]
        AUDIT[Audit Log<br/>所有操作]
    end

    U[User] --> GW
    GW --> AUTH
    AUTH --> RBAC
    RBAC --> S1
    RBAC --> S2
    S1 --> ENCRYPT
    S2 --> ENCRYPT
    GW --> AUDIT

    style GW fill:#ffcc80
    style AUDIT fill:#ce93d8
```

**安全措施**:
- **认证**: Bearer Token (OpenClaw 用户会话)
- **鉴权**: 基于用户 ID 隔离数据，仅访问自有策略/回测/数据
- **限流**: 100 req/min，防滥用
- **审计**: 所有 API 调用记录 `user_id`, `skill`, `method`, `params`

---

## 📦 部署拓扑

### 单机模式（开发）

```
┌────────────────────────────────────────┐
│      OpenClaw Host (本地 Mac/PC)       │
│  ┌──────────────────────────────────┐ │
│  │  Skills System (Python)          │ │
│  │  - All skills in-process         │ │
│  │  - SQLite (embedded)             │ │
│  │  - Redis (local or docker)       │ │
│  └──────────────────────────────────┘ │
│  ┌──────────────────────────────────┐ │
│  │  Docker (optional)               │ │
│  │  - Freqtrade container           │ │
│  │  - TA-Lib, ccxt deps             │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### 分布式模式（生产）

```mermaid
graph TB
    subgraph "Load Balancer"
        LB[Nginx / HAProxy]
    end

    subgraph "API Tier"
        GW1[API Gateway 1]
        GW2[API Gateway 2]
    end

    subgraph "Worker Tier"
        W1[Worker 1<br/>Strategy/Backtest]
        W2[Worker 2<br/>Hyperopt]
        W3[Worker 3<br/>Data Download]
        W4[Worker 4<br/>Reporting]
    end

    subgraph "Data Tier"
        PG[(PostgreSQL<br/>Primary)]
        PG_REPLICA[(PostgreSQL<br/>Replica)]
        REDIS[Redis Cluster<br/>Queue + Cache]
        MINIO[MinIO / S3<br/>File Storage]
    end

    subgraph "External"
        EX1[Exchange APIs<br/>Binance/OKX/Bybit]
        EX2[Data APIs<br/>CoinGecko]
    end

    LB --> GW1
    LB --> GW2
    GW1 --> W1
    GW1 --> W2
    GW2 --> W3
    GW2 --> W4

    W1 --> REDIS
    W2 --> REDIS
    W3 --> REDIS
    W4 --> REDIS

    W1 --> PG
    W2 --> PG
    W3 --> PG
    W4 --> PG

    PG --> PG_REPLICA
    W1 --> MINIO
    W2 --> MINIO
    W3 --> MINIO
    W4 --> MINIO

    W1 --> EX1
    W3 --> EX1
    W2 --> EX2

    style PG fill:#f8bbd0
    style REDIS fill:#d1c4e9
    style MINIO fill:#c8e6c9
```

**组件说明**:

| 组件 | 规格建议 | 说明 |
|-----|---------|------|
| API Gateway | 2 vCPU, 4GB RAM, LB 轮询 | 无状态，可水平扩展 |
| Worker | 4+ vCPU, 8+ GB RAM | Backtest/Hyperopt 计算密集，需大内存 |
| PostgreSQL | 4 vCPU, 16GB RAM, SSD | Primary + 至少一个 Replica（只读） |
| Redis | 2 vCPU, 4GB RAM | 用作 Celery queue + cache |
| MinIO/S3 | 对象存储，版本控制 | 存放数据文件、报告、图表 |

---

## 🔌 集成点

### OpenClaw Core
- **消息总线**: 技能间通信使用 OpenClaw message bus（可选）
- **会话管理**: 用户 OpenID 注入到每个任务上下文
- **权限控制**: RBAC 基于群里/角色

### 第三方依赖
| 服务 | 用途 | 访问方式 |
|-----|------|---------|
| **ccxt** | 交易所统一接口 | pip 包 (v4.5.4+) |
| **TA-Lib** | 技术指标计算 | 系统库 + Python binding |
| **Optuna** | Hyperopt 采样器 | pip 包 |
| **pandas / numpy** | 数据处理 | pip 包 |
| **FastAPI** | Web API (可选自建 UI) | pip 包 |
| **Redis** | 任务队列 | docker 或托管服务 |

---

## 📈 性能指标与容量规划

### 关键性能指标 (KPI)

| 指标 | 目标 | 测量方法 |
|-----|------|---------|
| **API 响应时间 (p50)** | < 100ms | 不包括耗时操作（backtest） |
| **Backtest 吞吐** | 1M bars/min (单 worker) | 10 years 5m data ≈ 100万 bars |
| **Hyperopt trial 时间** | < 30s (simple strategy) | 使用 5 年 5m BTC data |
| **数据下载速率** | 1M bars/min (取决于交易所) | Binance rate limit ~1200 req/min |

### 容量规划计算

**示例**: 支撑 10 个用户同时回测

```
每用户回测参数:
- 2 个交易对
- 5 年数据 (365*5*12 = 21900 根 5m K 线/对)
- 总计 bars = 2 * 21900 = 43800

单 worker 处理能力 (压测结果):
- 100万 bars/min

所需时间 = 43800 / 1e6 = 0.04 分钟 = 2.4 秒 ✅ 可并发
```

**Hyperopt** 更耗资源: 100 epochs × 0.5 min/epoch = 50 min，需排队或更多 worker。

---

## 🛠️ 开发环境搭建

### 快速启动 (Docker Compose)

```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: openclaw
      POSTGRES_PASSWORD: openclaw
      POSTGRES_DB: quant_trading
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

  api:
    build: .
    ports: ["8000:8000"]
    environment:
      DATABASE_URL: postgresql://openclaw:openclaw@postgres/quant_trading
      REDIS_URL: redis://redis:6379/0
    depends_on: [postgres, redis]

  worker:
    build: .
    command: celery -A skills worker --loglevel=info
    environment: *same_as_api*
    depends_on: [postgres, redis]

volumes:
  pgdata:
  redisdata:
```

---

## 🔮 未来演进

### Phase 2  enhancements
- **多策略组合**: Portfolio optimization (Mean-Variance, CVaR)
- **实盘交易**: WebSocket 深度订阅、订单簿管理
- **机器学习**: 集成 FreqAI 的 LGBM/XGBoost 模型训练流水线
- **性能优化**: 向量化回测引擎 (NumPy/Numba), 减少 Python 循环
- **多租户**: 多用户配额、计费、SLA

### Phase 3 企业级
- **审计追踪**: 完整策略变更/参数修改历史
- **监管合规**: 自动生成交易报告（IRS, 证监会格式）
- **灾备**: 跨区域数据库复制、热备 worker
- **多区域部署**: 低延迟接入不同大洲交易所

---

## 📚 相关文档

- `skill_architecture_analysis.md` - 架构分析原始报告
- `api_spec.json` - API 规范完整定义
- `risk_management_design.md` - 风险管理详细设计
- `error_handling_design.md` - 错误处理重试机制
- `parameter_schema.json` - 参数 Schema 定义

---

**维护者**: quant-skill-developer agent
**下一步**: Phase 2 开发启动时更新本架构图以反映实际实现
