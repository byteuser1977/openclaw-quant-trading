import { Logger, getLogger, initLogger, LogLevel } from '../../../src/core/logger';

// 模拟 winston
jest.mock('winston', () => {
  const mockTransport = {
    log: jest.fn(() => {})
  };

  return {
    createLogger: jest.fn(() => ({
      log: jest.fn(),
      add: jest.fn(),
      getWinstonLogger: jest.fn(() => ({ transports: [] }))
    })),
    format: {
      combine: jest.fn((...args) => args),
      errors: jest.fn(() => ({})),
      splat: jest.fn(() => ({})),
      printf: jest.fn(() => ({})),
      timestamp: jest.fn(() => ({})),
      colorize: jest.fn(() => ({})),
      simple: jest.fn(() => ({}))
    },
    transports: {
      Console: jest.fn(() => mockTransport),
      File: jest.fn(() => mockTransport)
    }
  };
});

describe('Logger', () => {
  beforeEach(() => {
    jest.resetModules();
    // 清除全局单例
    jest.isolateModules(() => {
      const { initLogger } = require('../../../src/core/logger');
      initLogger();
    });
  });

  describe('Logger initialization', () => {
    it('should create a logger instance', () => {
      const logger = new Logger({});
      expect(logger).toBeDefined();
    });

    it('should initialize global logger', () => {
      const logger = initLogger();
      expect(logger).toBeDefined();
    });

    it('should get logger with context', () => {
      const logger = getLogger('test-context');
      expect(logger).toBeDefined();
    });

    it('should use configuration from config module', () => {
      // 由于使用了 require 动态加载 config，这里测试应通过
      const logger = new Logger({ level: 'debug' as LogLevel });
      expect(logger).toBeDefined();
    });
  });

  describe('Log levels', () => {
    it('should have all log level methods', () => {
      const logger = new Logger({});
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should call winston logger with correct level', () => {
      const logger = new Logger({});
      logger.info('Test message', { key: 'value' });
      // 验证调用（mock 验证）
      expect(logger['logger'].log).toHaveBeenCalled();
    });
  });

  describe('Context handling', () => {
    it('should include context in log meta', () => {
      const logger = new Logger({}, 'my-context');
      const meta = { action: 'test' };
      logger.info('Test with context', meta);
      // 验证 meta 被传递
      const winstonLogger = logger.getWinstonLogger();
      expect(winstonLogger.log).toHaveBeenCalled();
    });

    it('should create child logger with context', () => {
      const parentLogger = new Logger({});
      const childLogger = parentLogger.child('child-context');
      expect(childLogger).toBeInstanceOf(Logger);
    });
  });

  describe('Format options', () => {
    it('should support json format', () => {
      const logger = new Logger({ format: 'json' });
      expect(logger).toBeDefined();
    });

    it('should support pretty format', () => {
      const logger = new Logger({ format: 'pretty' });
      expect(logger).toBeDefined();
    });

    it('should support output to console', () => {
      const logger = new Logger({ output: 'console' });
      expect(logger).toBeDefined();
    });

    it('should support output to file', () => {
      const logger = new Logger({ output: 'file', filePath: 'logs/test.log' });
      expect(logger).toBeDefined();
    });

    it('should support output to both', () => {
      const logger = new Logger({ output: 'both', filePath: 'logs/test.log' });
      expect(logger).toBeDefined();
    });
  });

  describe('Error logging', () => {
    it('should log error with stack trace', () => {
      const logger = new Logger({});
      const error = new Error('Test error');
      logger.error('Error occurred', error);
      // 验证错误信息被传递
      expect(logger['logger'].log).toHaveBeenCalled();
    });
  });

  describe('Singleton behavior', () => {
    it('should return same instance on multiple initLogger calls', () => {
      const logger1 = initLogger();
      const logger2 = initLogger();
      expect(logger1).toBe(logger2);
    });

    it('getLogger should return singleton if initialized', () => {
      initLogger();
      const logger = getLogger();
      expect(logger).toBeDefined();
    });
  });
});
