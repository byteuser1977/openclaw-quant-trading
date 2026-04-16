/**
 * 配置管理系统
 * 支持多环境配置、环境变量覆盖、热重载
 */

import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export type Environment = 'development' | 'testing' | 'production';

export interface ConfigSchema {
  app: {
    name: string;
    version: string;
    environment: Environment;
    debug: boolean;
  };
  database: {
    host: string;
    port: number;
    name: string;
    username?: string;
    password?: string;
    pool: {
      min: number;
      max: number;
      acquireTimeout: number;
      createTimeout: number;
      destroyTimeout: number;
      idleTimeout: number;
      reapInterval: number;
    };
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    retryStrategy?: {
      retries: number;
      factor: number;
      minTimeout: number;
      maxTimeout: number;
    };
  };
  api: {
    host: string;
    port: number;
    cors: {
      origin: string | string[];
      credentials: boolean;
    };
    rateLimit: {
      windowMs: number;
      maxRequests: number;
    };
  };
  logging: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    format: 'json' | 'pretty';
    output: 'console' | 'file' | 'both';
    filePath?: string;
    maxFiles: number;
    maxsize: number;
  };
  exchange: {
    default: string;
    timeout: number;
    retries: number;
    rateLimit: number;
  };
  backtesting: {
    defaultStartupCandles: number;
    maxDataPoints: number;
    cacheEnabled: boolean;
    cacheTTL: number;
  };
  risk: {
    maxPositionSizePercent: number;
    maxDailyLossPercent: number;
    maxDrawdownPercent: number;
    circuitBreakerEnabled: boolean;
  };
  hyperopt: {
    maxTrials: number;
    timeout: number;
    nJobs: number;
    earlyStopRounds: number;
  };
}

const defaultConfig: ConfigSchema = {
  app: {
    name: 'openclaw-quant-trading',
    version: '0.1.0',
    environment: 'development',
    debug: true
  },
  database: {
    host: 'localhost',
    port: 5432,
    name: 'openclaw_quant',
    username: 'postgres',
    password: undefined,
    pool: {
      min: 2,
      max: 10,
      acquireTimeout: 30000,
      createTimeout: 30000,
      destroyTimeout: 5000,
      idleTimeout: 30000,
      reapInterval: 1000
    }
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    retryStrategy: {
      retries: 10,
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 30000
    }
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
    level: 'info',
    format: 'json',
    output: 'console',
    maxFiles: 14,
    maxsize: 10485760 // 10MB
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

type ConfigProvider = 'env' | 'file' | 'default';

class ConfigManager {
  private config: ConfigSchema;
  private providers: ConfigProvider[];
  private loadedFiles: string[] = [];

  constructor(env: Environment = 'development') {
    this.providers = ['default', 'file', 'env'];
    this.config = this.loadConfig(env);
  }

  private loadConfig(env: Environment): ConfigSchema {
    let config = { ...defaultConfig };

    config.app.environment = env;

    // 1. 从配置文件加载
    const configFiles = [
      `configs/default.json`,
      `configs/${env}.json`
    ];

    for (const file of configFiles) {
      if (existsSync(file)) {
        try {
          const fileConfig = JSON.parse(readFileSync(file, 'utf-8'));
          config = this.deepMerge(config, fileConfig);
          this.loadedFiles.push(file);
          console.log(`[Config] Loaded configuration from ${file}`);
        } catch (error) {
          console.error(`[Config] Failed to load ${file}:`, error);
        }
      }
    }

    // 2. 从环境变量加载（优先级最高）
    this.loadEnvOverrides(config);

    return config;
  }

  private loadEnvOverrides(config: ConfigSchema): void {
    const ENV_PREFIX = 'OPENCLAW_QUANT_';

    // 辅助函数：通过环境变量路径更新嵌套配置
    const override = (path: string[], value: string, target: any): boolean => {
      if (path.length === 1) {
        const key = path[0];
        if (value !== undefined && target[key] !== undefined) {
          const currentType = typeof target[key];
          if (currentType === 'boolean') {
            target[key] = value === 'true' || value === '1';
          } else if (currentType === 'number') {
            target[key] = parseFloat(value);
          } else {
            target[key] = value;
          }
          return true;
        }
      }
      return false;
    };

    // 扫描所有环境变量，匹配 OPENCLAW_QUANT_ 前缀
    for (const [key, value] of Object.entries(process.env)) {
      if (!key.startsWith(ENV_PREFIX)) continue;
      if (value === undefined) continue; // skip undefined env values

      const path = key
        .replace(ENV_PREFIX.toLowerCase(), '')
        .toLowerCase()
        .split('_')
        .filter(Boolean);

      if (path.length === 0) continue;

      // 尝试匹配配置路径，使用 any 以允许动态属性访问
      let current = config as any;
      for (let i = 0; i < path.length - 1; i++) {
        const segment = path[i];
        if (current[segment] === undefined) break;
        current = current[segment];
      }

      const lastKey = path[path.length - 1];
      if (typeof lastKey === 'undefined') continue;
      if (override([lastKey], value, current)) {
        console.log(`[Config] Overridden ${key} from environment`);
      }
    }
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * 获取完整配置，或指定路径的配置项
   */
  get<T>(path?: string): T | ConfigSchema | undefined {
    if (path === undefined) {
      return { ...this.config } as T;
    }
    const keys = path.split('.');
    let value: any = this.config;
    for (const key of keys) {
      if (value === undefined || value === null) return undefined;
      value = value[key];
    }
    return value as T;
  }

  // 检查配置是否已从文件加载
  isLoadedFrom(file: string): boolean {
    return this.loadedFiles.includes(file);
  }

  // 重新加载配置（热重载）
  reload(env?: Environment): void {
    const currentEnv = env ?? this.config.app.environment;
    this.config = this.loadConfig(currentEnv);
    console.log(`[Config] Configuration reloaded for environment: ${currentEnv}`);
  }

  // 验证配置必需字段
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查关键配置
    if (!this.config.database.host) errors.push('database.host is required');
    if (!this.config.database.name) errors.push('database.name is required');
    if (!this.config.api.host) errors.push('api.host is required');

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// 全局配置实例（懒加载）
let globalConfig: ConfigManager | null = null;

/**
 * 初始化全局配置
 */
export function initConfig(env?: Environment): ConfigManager {
  if (!globalConfig) {
    // 加载 .env 文件
    dotenv.config();
    globalConfig = new ConfigManager(env);
  }
  return globalConfig;
}

/**
 * 获取全局配置实例
 */
export function getConfig(): ConfigSchema {
  if (!globalConfig) {
    initConfig();
  }
  return globalConfig!.get<ConfigSchema>()!;
}

/**
 * 获取指定配置项
 */
export function getConfigValue<T>(path: string): T | undefined {
  if (!globalConfig) {
    initConfig();
  }
  return (globalConfig!.get<T>(path) as T | undefined);
}

/**
 * 验证配置
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  if (!globalConfig) {
    initConfig();
  }
  return globalConfig!.validate();
}

// Export ConfigManager class; ConfigSchema and Environment are already exported above
export { ConfigManager };
