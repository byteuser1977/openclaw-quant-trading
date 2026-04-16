/**
 * 统一错误处理框架
 * 定义错误类别、重试策略、熔断保护
 */

/**
 * 错误类别枚举
 * 对应 API 规范中的错误码范围
 */
export enum ErrorCategory {
  VALIDATION = 1,       // 参数错误 (1000-1999)
  STRATEGY = 3,         // 策略错误 (3000-3999)
  DATABASE = 4,         // 数据库错误 (4000-4999)
  EXCHANGE = 5,         // 交易所错误 (5000-5999)
  NETWORK = 6,          // 网络错误 (6000-6999)
  FILE = 7,             // 文件错误 (7000-7999)
  INTERNAL = 8,         // 内部错误 (8000-8999)
  AUTH = 9,             // 认证错误 (9000-9999)
  UNKNOWN = 9999        // 未知错误
}

/**
 * 重试策略
 */
export enum RetryStrategy {
  NONE = 'none',
  FIXED = 'fixed',
  EXPONENTIAL = 'exponential'
}

/**
 * 自定义异常基类
 */
export class OpenClawError extends Error {
  public readonly category: ErrorCategory;
  public readonly code: number;
  public readonly retryable: boolean;
  public readonly details?: any;

  constructor(
    message: string,
    category: ErrorCategory = ErrorCategory.UNKNOWN,
    code: number = 9999,
    retryable: boolean = false,
    details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;
    this.code = code;
    this.retryable = retryable;
    this.details = details;

    // 保持正确的堆栈追踪（仅 V8）
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      code: this.code,
      retryable: this.retryable,
      details: this.details,
      stack: this.stack
    };
  }

  toString(): string {
    return `${this.name}[${this.code}]: ${this.message}`;
  }
}

// =====================================================
// 具体异常类（按类别）
// =====================================================

/**
 * 参数验证错误
 */
export class ValidationError extends OpenClawError {
  constructor(
    message: string,
    field?: string,
    value?: any,
    constraints?: Record<string, string>
  ) {
    super(message, ErrorCategory.VALIDATION, 1001, false, {
      field,
      value,
      constraints
    });
    this.name = 'ValidationError';
  }
}

/**
 * 策略错误
 */
export class StrategyError extends OpenClawError {
  constructor(
    message: string,
    code: number = 3001,
    details?: any
  ) {
    super(message, ErrorCategory.STRATEGY, code, false, details);
    this.name = 'StrategyError';
  }
}

/**
 * 数据库错误
 */
export class DatabaseError extends OpenClawError {
  constructor(
    message: string,
    code: number = 4001,
    retryable: boolean = true,
    details?: any
  ) {
    super(message, ErrorCategory.DATABASE, code, retryable, details);
    this.name = 'DatabaseError';
  }
}

/**
 * 交易所错误
 */
export class ExchangeError extends OpenClawError {
  constructor(
    message: string,
    code: number = 5001,
    retryable: boolean = true,
    details?: any
  ) {
    super(message, ErrorCategory.EXCHANGE, code, retryable, details);
    this.name = 'ExchangeError';
  }
}

/**
 * 网络错误
 */
export class NetworkError extends OpenClawError {
  constructor(
    message: string,
    code: number = 6001,
    retryable: boolean = true,
    cause?: Error
  ) {
    super(message, ErrorCategory.NETWORK, code, retryable, { cause });
    this.name = 'NetworkError';
  }
}

/**
 * 文件错误
 */
export class FileError extends OpenClawError {
  constructor(
    message: string,
    code: number = 7001,
    retryable: boolean = false,
    details?: any
  ) {
    super(message, ErrorCategory.FILE, code, retryable, details);
    this.name = 'FileError';
  }
}

/**
 * 认证错误
 */
export class AuthError extends OpenClawError {
  constructor(
    message: string,
    code: number = 9001,
    details?: any
  ) {
    super(message, ErrorCategory.AUTH, code, false, details);
    this.name = 'AuthError';
  }
}

/**
 * 配置错误
 */
export class ConfigError extends OpenClawError {
  constructor(
    message: string,
    field?: string,
    details?: any
  ) {
    super(message, ErrorCategory.VALIDATION, 1002, false, { field, details });
    this.name = 'ConfigError';
  }
}

// =====================================================
// 重试装饰器
// =====================================================

export interface RetryOptions {
  maxRetries?: number;
  strategy?: RetryStrategy;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: (new (...args: any[]) => OpenClawError)[];
  onRetry?: (attempt: number, error: OpenClawError) => void;
}

/**
 * 重试装饰器
 * 自动重试可重试错误
 */
export function retry<T extends (...args: any[]) => Promise<any>>(
  options: RetryOptions = {}
): MethodDecorator {
  const {
    maxRetries = 3,
    strategy = RetryStrategy.EXPONENTIAL,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryableErrors = [NetworkError, ExchangeError, DatabaseError],
    onRetry
  } = options;

  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error | null = null;
      let attempt = 0;

      while (attempt <= maxRetries) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error: any) {  // <-- 使用 any 避免 unknown 类型冲突
          lastError = error;

          // 检查是否是可重试错误
          const isRetryable = retryableErrors.some(ErrorClass =>
            error instanceof ErrorClass
          );

          if (!isRetryable || attempt >= maxRetries) {
            throw error;
          }

          attempt++;

          // 计算重试延迟
          let delayMs: number;
          switch (strategy) {
            case RetryStrategy.FIXED:
              delayMs = baseDelayMs;
              break;
            case RetryStrategy.EXPONENTIAL:
              delayMs = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
              break;
            default:
              delayMs = 0;
          }

          // 添加抖动（避免惊群）
          if (delayMs > 0) {
            const jitter = Math.random() * 0.1 * delayMs;
            delayMs += jitter;
          }

          // 通知回调
          if (onRetry && error instanceof OpenClawError) {
            onRetry(attempt, error);
          }

          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

// =====================================================
// 熔断器（Circuit Breaker）
// =====================================================

export interface CircuitBreakerOptions {
  failureThreshold: number;      // 失败阈值（连续失败次数）
  resetTimeoutMs: number;        // 重置超时（毫秒）
  halfOpenMaxCalls: number;      // 半开状态下最大调用次数
}

export class CircuitBreaker {
  private failures: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private lastFailureTime: number = 0;
  private options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions) {
    this.options = Object.assign(
      {
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        halfOpenMaxCalls: 3
      },
      options
    );
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.failures = 0;
      } else {
        throw new OpenClawError(
          'Circuit breaker is OPEN',
          ErrorCategory.INTERNAL,
          8001,
          false,
          { state: this.state }
        );
      }
    }

    try {
      const result = await fn();

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.options.failureThreshold) {
        this.state = 'OPEN';
      }

      if (error instanceof OpenClawError) {
        throw error;
      }
      throw new OpenClawError(
        error instanceof Error ? error.message : 'Unknown error',
        ErrorCategory.INTERNAL,
        8002,
        false,
        { cause: error }
      );
    }
  }

  getState(): string {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.lastFailureTime = 0;
  }
}

// =====================================================
// 错误处理工具函数
// =====================================================

/**
 * 安全的错误包装
 */
export function wrapError(
  error: unknown,
  defaultMessage: string = 'An unexpected error occurred'
): OpenClawError {
  if (error instanceof OpenClawError) {
    return error;
  }

  if (error instanceof Error) {
    return new OpenClawError(
      error.message,
      ErrorCategory.INTERNAL,
      8999,
      false,
      { originalError: error.name, stack: error.stack }
    );
  }

  return new OpenClawError(
    defaultMessage,
    ErrorCategory.INTERNAL,
    8999,
    false,
    { original: error }
  );
}

/**
 * 错误分类映射
 */
export const ERROR_MAP: Record<number, { category: ErrorCategory; defaultMessage: string }> = {
  // 验证错误
  1001: { category: ErrorCategory.VALIDATION, defaultMessage: 'Validation failed' },
  1002: { category: ErrorCategory.VALIDATION, defaultMessage: 'Configuration error' },

  // 策略错误
  3001: { category: ErrorCategory.STRATEGY, defaultMessage: 'Strategy error' },
  3002: { category: ErrorCategory.STRATEGY, defaultMessage: 'Indicator calculation failed' },

  // 数据库错误
  4001: { category: ErrorCategory.DATABASE, defaultMessage: 'Database operation failed' },
  4002: { category: ErrorCategory.DATABASE, defaultMessage: 'Connection error' },

  // 交易所错误
  5001: { category: ErrorCategory.EXCHANGE, defaultMessage: 'Exchange API error' },
  5002: { category: ErrorCategory.EXCHANGE, defaultMessage: 'Order failed' },

  // 网络错误
  6001: { category: ErrorCategory.NETWORK, defaultMessage: 'Network request failed' },
  6002: { category: ErrorCategory.NETWORK, defaultMessage: 'Timeout' },

  // 文件错误
  7001: { category: ErrorCategory.FILE, defaultMessage: 'File operation failed' },
  7002: { category: ErrorCategory.FILE, defaultMessage: 'File not found' },

  // 认证错误
  9001: { category: ErrorCategory.AUTH, defaultMessage: 'Authentication failed' },
  9002: { category: ErrorCategory.AUTH, defaultMessage: 'Authorization failed' }
};

// Note: CircuitBreakerOptions is already exported via interface declaration above.
