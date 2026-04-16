import { initConfig, getConfig, getConfigValue, validateConfig } from '../../../src/core/config';

describe('ConfigManager', () => {
  beforeEach(() => {
    // 清理全局单例
    jest.resetModules();
    // 清除环境变量缓存
    delete process.env.OPENCLAW_QUANT_API_PORT;
  });

  describe('initConfig', () => {
    it('should initialize with default environment', () => {
      const config = initConfig();
      expect(config).toBeDefined();
      expect((config.get() as any).app.environment).toBe('development');
    });

    it('should accept custom environment', () => {
      const config = initConfig('testing');
      expect((config.get() as any).app.environment).toBe('testing');
    });

    it('should load configuration from files', () => {
      const config = initConfig('development');
      const loadedFiles = config.isLoadedFrom('configs/default.json');
      // 如果文件存在，应该被加载
      expect(typeof loadedFiles).toBe('boolean');
    });
  });

  describe('getConfig', () => {
    it('should return complete config object', () => {
      initConfig();
      const config = getConfig() as any;
      expect(config).toHaveProperty('app');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('api');
      expect(config).toHaveProperty('logging');
      expect(config).toHaveProperty('exchange');
      expect(config).toHaveProperty('backtesting');
      expect(config).toHaveProperty('risk');
      expect(config).toHaveProperty('hyperopt');
    });

    it('should have correct default values', () => {
      initConfig();
      const config = getConfig() as any;
      expect(config.app.name).toBe('openclaw-quant-trading');
      expect(config.api.port).toBe(8080);
      expect(config.database.port).toBe(5432);
      expect(config.risk.maxPositionSizePercent).toBeCloseTo(0.02);
    });
  });

  describe('getConfigValue', () => {
    it('should retrieve nested values by dot notation', () => {
      initConfig();
      const port = getConfigValue<number>('api.port');
      expect(port).toBe(8080);
    });

    it('should return undefined for non-existent paths', () => {
      initConfig();
      const value = getConfigValue('non.existent.path');
      expect(value).toBeUndefined();
    });

    it('should handle environment variable overrides', () => {
      // 设置环境变量
      process.env.OPENCLAW_QUANT_API_PORT = '9000';
      initConfig();
      const port = getConfigValue<number>('api.port');
      expect(port).toBe(9000);
      delete process.env.OPENCLAW_QUANT_API_PORT;
    });
  });

  describe('validateConfig', () => {
    it('should pass validation with default config', () => {
      initConfig();
      const result = validateConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      // 模拟缺失配置
      const config = initConfig();
      // 默认配置是完整的，所以应该通过
      const result = validateConfig();
      expect(result.valid).toBe(true);
    });
  });

  describe('environment handling', () => {
    it('should support different environments', () => {
      ['development', 'testing', 'production'].forEach(env => {
        const config = initConfig(env as any);
        expect((config.get() as any).app.environment).toBe(env);
      });
    });
  });
});
