/**
 * 配置相关的测试 fixtures
 */

export const validConfig = {
  app: {
    name: 'test-app',
    version: '1.0.0',
    environment: 'testing' as const,
    debug: false
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'test_db',
    username: 'test_user',
    password: 'test_pass',
    pool: {
      min: 1,
      max: 5,
      acquireTimeout: 10000,
      createTimeout: 10000,
      destroyTimeout: 5000,
      idleTimeout: 10000,
      reapInterval: 1000
    }
  },
  redis: {
    host: 'localhost',
    port: 6379,
    db: 1
  },
  api: {
    host: '127.0.0.1',
    port: 3000,
    cors: {
      origin: 'http://localhost:3000',
      credentials: true
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 50
    }
  },
  logging: {
    level: 'debug' as const,
    format: 'pretty' as const,
    output: 'console' as const,
    maxFiles: 7,
    maxsize: 5242880
  },
  exchange: {
    default: 'binance',
    timeout: 15000,
    retries: 2,
    rateLimit: 50
  },
  backtesting: {
    defaultStartupCandles: 100,
    maxDataPoints: 100000,
    cacheEnabled: false,
    cacheTTL: 1800
  },
  risk: {
    maxPositionSizePercent: 0.01,
    maxDailyLossPercent: 0.02,
    maxDrawdownPercent: 0.10,
    circuitBreakerEnabled: true
  },
  hyperopt: {
    maxTrials: 50,
    timeout: 1800,
    nJobs: 2,
    earlyStopRounds: 5
  }
};

export const minimalConfig = {
  app: {
    name: 'minimal',
    version: '0.0.1',
    environment: 'development' as const,
    debug: true
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'minimal_db'
  },
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0
  },
  api: {
    host: '0.0.0.0',
    port: 8080,
    cors: {
      origin: '*',
      credentials: false
    },
    rateLimit: {
      windowMs: 60000,
      maxRequests: 100
    }
  },
  logging: {
    level: 'info' as const,
    format: 'json' as const,
    output: 'console' as const,
    maxFiles: 14,
    maxsize: 10485760
  },
  exchange: {
    default: 'binance',
    timeout: 30000,
    retries: 3,
    rateLimit: 100
  },
  backtesting: {
    defaultStartupCandles: 200,
    maxDataPoints: 1000000,
    cacheEnabled: true,
    cacheTTL: 3600
  },
  risk: {
    maxPositionSizePercent: 0.02,
    maxDailyLossPercent: 0.05,
    maxDrawdownPercent: 0.20,
    circuitBreakerEnabled: true
  },
  hyperopt: {
    maxTrials: 100,
    timeout: 3600,
    nJobs: 4,
    earlyStopRounds: 10
  }
};

export const envVarOverrides = {
  'OPENCLAW_QUANT_API_PORT': '9000',
  'OPENCLAW_QUANT_LOGGING_LEVEL': 'debug',
  'OPENCLAW_QUANT_DATABASE_HOST': 'db.example.com',
  'OPENCLAW_QUANT_RISK_MAX_POSITION_SIZE_PERCENT': '0.05'
};

export const invalidConfig = {
  // 缺少必需字段
  app: {
    name: '',
    version: '',
    environment: 'invalid' as any,
    debug: true
  },
  database: {
    port: 'not-a-number' as any
  },
  api: {
    cors: {
      origin: '*',
      credentials: 'yes' as any
    },
    rateLimit: {
      windowMs: -1,
      maxRequests: 0
    }
  }
};
