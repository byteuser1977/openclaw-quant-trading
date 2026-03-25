/**
 * OpenClaw Quant Trading - Configuration Management System
 *
 * Supports three-tier configuration priority:
 * 1. Default values (hardcoded)
 * 2. Environment-specific JSON file (configs/{env}.json)
 * 3. Environment variables (OPENCLAW_QUANT_*)
 */

export interface ConfigSchema {
  app: {
    name: string;
    version: string;
    env: 'development' | 'testing' | 'production';
  };
  logging: {
    level: 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug';
    format: 'json' | 'pretty';
    output: 'console' | 'file' | 'both';
    logDir: string;
    maxFiles: number;
    maxSizeMB: number;
  };
  database: {
    type: 'sqlite' | 'postgresql';
    path?: string; // For SQLite
    url?: string; // For PostgreSQL
    poolMin?: number;
    poolMax?: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  exchange: {
    default: 'binance';
    timeout: number;
    enableRateLimit: boolean;
    maxRetries: number;
  };
  strategy: {
    defaultTimeframe: string;
    maxIndicators: number;
    maxOpenTrades: number;
  };
  backtest: {
    defaultFee: number;
    defaultSlippage: number;
    dryRun: boolean;
  };
  hyperopt: {
    maxEpochs: number;
    nJobs: number;
    sampler: 'tpe' | 'random' | 'cmaes';
    pruner: 'hyperband' | 'median' | 'none';
  };
}

export const DefaultConfig: ConfigSchema = {
  app: {
    name: 'openclaw-quant-trading',
    version: '0.1.0',
    env: 'development',
  },
  logging: {
    level: 'info',
    format: 'pretty',
    output: 'console',
    logDir: 'logs',
    maxFiles: 10,
    maxSizeMB: 10,
  },
  database: {
    type: 'sqlite',
    path: './data/trades.db',
    poolMin: 0,
    poolMax: 10,
  },
  redis: {
    host: 'localhost',
    port: 6379,
    db: 0,
  },
  exchange: {
    default: 'binance',
    timeout: 30000,
    enableRateLimit: true,
    maxRetries: 3,
  },
  strategy: {
    defaultTimeframe: '5m',
    maxIndicators: 50,
    maxOpenTrades: 5,
  },
  backtest: {
    defaultFee: 0.001,
    defaultSlippage: 0.001,
    dryRun: true,
  },
  hyperopt: {
    maxEpochs: 100,
    nJobs: 1,
    sampler: 'tpe',
    pruner: 'none',
  },
};

class ConfigManager {
  private config: ConfigSchema;
  private env: string;
  private configDir: string;

  constructor(env: string = 'development', configDir: string = 'configs') {
    this.env = env;
    this.configDir = configDir;
    this.config = { ...DefaultConfig };
    this.load();
  }

  private load(): void {
    // 1. Start with defaults (already in this.config)

    // 2. Load environment-specific JSON file
    const configFile = `${this.configDir}/${this.env}.json`;
    try {
      const fs = require('fs');
      const path = require('path');
      if (fs.existsSync(configFile)) {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const envConfig = JSON.parse(raw);
        this.config = this.deepMerge(this.config, envConfig);
      }
    } catch (err) {
      console.warn(`Failed to load config file ${configFile}: ${err.message}`);
    }

    // 3. Override with environment variables
    this.loadEnvOverrides();
  }

  private loadEnvOverrides(): void {
    const prefix = 'OPENCLAW_QUANT_';
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix)) {
        const configKey = key.slice(prefix.length).toLowerCase();
        this.setByPath(configKey, value);
      }
    }
  }

  private setByPath(path: string, value: any): void {
    const keys = path.split('.');
    let current: any = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    const finalKey = keys[keys.length - 1];
    // Type coercion based on default value
    const defaultValue = this.getByPath(path);
    if (defaultValue !== undefined) {
      const type = typeof defaultValue;
      if (type === 'number') {
        value = Number(value);
      } else if (type === 'boolean') {
        value = value === 'true';
      }
    }
    current[finalKey] = value;
  }

  private getByPath(path: string): any {
    const keys = path.split('.');
    let current: any = this.config;
    for (const key of keys) {
      if (!current) return undefined;
      current = current[key];
    }
    return current;
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach((key) => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }

  private isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  get(): ConfigSchema {
    return this.config;
  }

  // Private helper only - no public duplicate
  private getByPath(path: string): any {
    const keys = path.split('.');
    let current: any = this.config;
    for (const key of keys) {
      if (!current) return undefined;
      current = current[key];
    }
    return current;
  }

  reload(): void {
    this.config = { ...DefaultConfig };
    this.load();
  }

  validate(): boolean {
    // Basic validation
    const c = this.config;
    if (!c.app.name || !c.app.version) return false;
    if (c.logging.level && !['error', 'warn', 'info', 'http', 'verbose', 'debug'].includes(c.logging.level)) {
      return false;
    }
    if (c.database.type && !['sqlite', 'postgresql'].includes(c.database.type)) {
      return false;
    }
    if (c.hyperopt.sampler && !['tpe', 'random', 'cmaes'].includes(c.hyperopt.sampler)) {
      return false;
    }
    return true;
  }
}

// Singleton instance
let configManager: ConfigManager | null = null;

export function initConfig(env?: string, configDir?: string): ConfigSchema {
  if (!configManager) {
    configManager = new ConfigManager(env, configDir);
  }
  return configManager.get();
}

export function getConfig(): ConfigSchema {
  if (!configManager) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  return configManager.get();
}

export function getConfigValue<T>(path: string): T {
  if (!configManager) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  const value = configManager.getByPath(path);
  if (value === undefined) {
    throw new Error(`Config path "${path}" does not exist`);
  }
  return value as T;
}

export function reloadConfig(): ConfigSchema {
  if (!configManager) {
    throw new Error('Config not initialized. Call initConfig() first.');
  }
  configManager.reload();
  return configManager.get();
}

export { ConfigManager };
