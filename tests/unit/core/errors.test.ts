import {
  OpenClawError,
  ValidationError,
  StrategyError,
  DatabaseError,
  ExchangeError,
  NetworkError,
  FileError,
  AuthError,
  ConfigError,
  ErrorCategory,
  RetryStrategy,
  CircuitBreaker,
  wrapError,
  retry,
  ERROR_MAP
} from '../../../src/core/errors';

describe('OpenClawError', () => {
  it('should create error with correct properties', () => {
    const error = new OpenClawError('Test message', ErrorCategory.VALIDATION, 1001, false);
    expect(error.message).toBe('Test message');
    expect(error.category).toBe(ErrorCategory.VALIDATION);
    expect(error.code).toBe(1001);
    expect(error.retryable).toBe(false);
    expect(error.name).toBe('OpenClawError');
  });

  it('should include details when provided', () => {
    const details = { field: 'test', value: 'bad' };
    const error = new OpenClawError('Test', ErrorCategory.VALIDATION, 1001, false, details);
    expect(error.details).toEqual(details);
  });

  it('should serialize to JSON', () => {
    const error = new OpenClawError('Test', ErrorCategory.NETWORK, 6001, true);
    const json = error.toJSON();
    expect(json).toHaveProperty('name', 'OpenClawError');
    expect(json).toHaveProperty('message', 'Test');
    expect(json).toHaveProperty('category', ErrorCategory.NETWORK);
    expect(json).toHaveProperty('code', 6001);
    expect(json).toHaveProperty('retryable', true);
  });

  it('should provide useful string representation', () => {
    const error = new OpenClawError('Test error', ErrorCategory.EXCHANGE, 5001);
    expect(error.toString()).toBe('OpenClawError[5001]: Test error');
  });
});

describe('Specific Error Classes', () => {
  describe('ValidationError', () => {
    it('should have correct category and default code', () => {
      const error = new ValidationError('Invalid input');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.code).toBe(1001);
      expect(error.name).toBe('ValidationError');
    });

    it('should include field info', () => {
      const error = new ValidationError('Invalid', 'email', 'not-an-email');
      expect(error.details?.field).toBe('email');
      expect(error.details?.value).toBe('not-an-email');
    });
  });

  describe('StrategyError', () => {
    it('should have correct category', () => {
      const error = new StrategyError('Strategy failed', 3002);
      expect(error.category).toBe(ErrorCategory.STRATEGY);
      expect(error.code).toBe(3002);
    });
  });

  describe('DatabaseError', () => {
    it('should be retryable by default', () => {
      const error = new DatabaseError('DB connection lost');
      expect(error.retryable).toBe(true);
    });

    it('should allow non-retryable', () => {
      const error = new DatabaseError('Corrupt data', 4002, false);
      expect(error.retryable).toBe(false);
    });
  });

  describe('ExchangeError', () => {
    it('should be retryable by default', () => {
      const error = new ExchangeError('Rate limit exceeded');
      expect(error.retryable).toBe(true);
    });
  });

  describe('NetworkError', () => {
    it('should be retryable by default', () => {
      const error = new NetworkError('Connection timeout');
      expect(error.retryable).toBe(true);
    });

    it('should include cause', () => {
      const cause = new Error('Original network error');
      const error = new NetworkError('Failed', 6001, true, cause);
      expect(error.details?.cause).toBe(cause);
    });
  });

  describe('FileError', () => {
    it('should not be retryable by default', () => {
      const error = new FileError('File not found');
      expect(error.retryable).toBe(false);
    });
  });

  describe('AuthError', () => {
    it('should have correct category', () => {
      const error = new AuthError('Invalid token');
      expect(error.category).toBe(ErrorCategory.AUTH);
      expect(error.code).toBe(9001);
    });
  });

  describe('ConfigError', () => {
    it('should have validation category', () => {
      const error = new ConfigError('Missing config', 'database.url');
      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.code).toBe(1002);
      expect(error.details?.field).toBe('database.url');
    });
  });
});

describe('ERROR_MAP', () => {
  it('should contain mappings for all error codes', () => {
    expect(ERROR_MAP[1001]).toBeDefined();
    expect(ERROR_MAP[1002]).toBeDefined();
    expect(ERROR_MAP[3001]).toBeDefined();
    expect(ERROR_MAP[4001]).toBeDefined();
    expect(ERROR_MAP[5001]).toBeDefined();
    expect(ERROR_MAP[6001]).toBeDefined();
    expect(ERROR_MAP[7001]).toBeDefined();
    expect(ERROR_MAP[8001]).toBeDefined();
    expect(ERROR_MAP[9001]).toBeDefined();
  });

  it('should have correct category and message for each mapping', () => {
    expect(ERROR_MAP[1001].category).toBe(ErrorCategory.VALIDATION);
    expect(ERROR_MAP[3001].category).toBe(ErrorCategory.STRATEGY);
    expect(ERROR_MAP[5001].category).toBe(ErrorCategory.EXCHANGE);
  });
});

describe('wrapError', () => {
  it('should wrap unknown error', () => {
    const unknown = 'string error';
    const wrapped = wrapError(unknown);
    expect(wrapped instanceof OpenClawError).toBe(true);
    expect(wrapped.message).toBe('An unexpected error occurred');
  });

  it('should preserve OpenClawError', () => {
    const original = new NetworkError('Original');
    const wrapped = wrapError(original);
    expect(wrapped).toBe(original);
  });

  it('should wrap native Error', () => {
    const native = new Error('Native error');
    const wrapped = wrapError(native);
    expect(wrapped instanceof OpenClawError).toBe(true);
    expect(wrapped.message).toBe('Native error');
  });
});

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenMaxCalls: 2
    });
  });

  it('should start in CLOSED state', () => {
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should switch to OPEN after failures exceed threshold', async () => {
    const failingFn = jest.fn().mockRejectedValue(new Error('fail'));

    // 连续失败 3 次
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {
        // 预期失败
      }
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('should allow retry after reset timeout', async () => {
    const failingFn = jest.fn().mockRejectedValue(new Error('fail'));
    const successFn = jest.fn().mockResolvedValue('success');

    // 触发熔断
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingFn);
      } catch (e) {}
    }

    expect(breaker.getState()).toBe('OPEN');

    // 手动重置时间以便测试（实际需等待）
    breaker['lastFailureTime'] = 0;
    breaker['state'] = 'OPEN';

    // 快速通过 HALF_OPEN 到 CLOSED
    const result = await breaker.execute(successFn);
    expect(result).toBe('success');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('should reset failures after successful call', async () => {
    const failingOnce = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    try {
      await breaker.execute(failingOnce);
    } catch (e) {}

    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('Retry decorator', () => {
  // 使用辅助类测试装饰器
  class TestService {
    private attempt = 0;

    @retry({
      maxRetries: 2,
      strategy: RetryStrategy.FIXED,
      baseDelayMs: 10
    })
    async flakyOperation(): Promise<string> {
      this.attempt++;
      if (this.attempt < 3) {
        throw new NetworkError('Network issue');
      }
      return 'success';
    }
  }

  it('should retry on retryable errors', async () => {
    const service = new TestService();
    const result = await service.flakyOperation();
    expect(result).toBe('success');
    // Check that the operation eventually succeeded after retries
    // (attempt count is internal, we just verify the outcome)
  });

  it('should fail after max retries exceeded', async () => {
    const service = new TestService();
    // Exceed retries by pre-setting attempt to max
    (service as any).attempt = 3;

    await expect(service.flakyOperation()).rejects.toThrow(NetworkError);
  });
});
