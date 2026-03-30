/**
 * OpenClaw Quant Trading - Error Handling Framework
 *
 * Provides:
 * - Error categorization (9 categories)
 * - Base Error class with retryable flag
 * - Specific error classes
 * - @retry decorator with exponential backoff
 * - Circuit Breaker pattern
 */

export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  STRATEGY = 'STRATEGY',
  DATABASE = 'DATABASE',
  EXCHANGE = 'EXCHANGE',
  NETWORK = 'NETWORK',
  FILE = 'FILE',
  INTERNAL = 'INTERNAL',
  AUTH = 'AUTH',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorOptions {
  category?: ErrorCategory;
  code?: string;
  message?: string;
  retryable?: boolean;
  details?: Record<string, any>;
  cause?: Error;
}

export class OpenClawError extends Error {
  public readonly category: ErrorCategory;
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly details: Record<string, any> | null;
  public readonly timestamp: Date;

  constructor(
    message: string,
    options: ErrorOptions = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = options.category ?? ErrorCategory.UNKNOWN;
    this.code = options.code ?? 'UNKNOWN';
    this.retryable = options.retryable ?? false;
    this.details = options.details ?? null;
    this.timestamp = new Date();

    // Maintains proper stack trace (only available in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Validation errors (1xxx)
export class ValidationError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, {
      category: ErrorCategory.VALIDATION,
      code: '1000',
      retryable: false,
      details,
    });
  }
}

// Strategy errors (3xxx)
export class StrategyError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>, retryable = false) {
    super(message, {
      category: ErrorCategory.STRATEGY,
      code: '3000',
      retryable,
      details,
    });
  }
}

// Database errors (4xxx)
export class DatabaseError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>, retryable = true) {
    super(message, {
      category: ErrorCategory.DATABASE,
      code: '4000',
      retryable,
      details,
    });
  }
}

// Exchange errors (5xxx)
export class ExchangeError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, {
      category: ErrorCategory.EXCHANGE,
      code: '5000',
      retryable: true,
      details,
    });
  }
}

// Network errors (2xxx)
export class NetworkError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, {
      category: ErrorCategory.NETWORK,
      code: '2000',
      retryable: true,
      details,
    });
  }
}

// File errors (6xxx)
export class FileError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, {
      category: ErrorCategory.FILE,
      code: '6000',
      retryable: false,
      details,
    });
  }
}

// Authentication errors (7xxx)
export class AuthError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, {
      category: ErrorCategory.AUTH,
      code: '7000',
      retryable: false,
      details,
    });
  }
}

// Config errors (8xxx)
export class ConfigError extends OpenClawError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, {
      category: ErrorCategory.INTERNAL,
      code: '8000',
      retryable: false,
      details,
    });
  }
}

// Retry decorator
export interface RetryOptions {
  maxAttempts?: number;
  backoffMs?: number;
  backoffStrategy?: 'linear' | 'exponential' | 'fixed';
  jitter?: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

export function retry(
  options: RetryOptions = {}
): <T extends (...args: any[]) => Promise<any>>(target: T, propertyKey: string, descriptor: PropertyDescriptor) => void {
  const {
    maxAttempts = 3,
    backoffMs = 1000,
    backoffStrategy = 'exponential',
    jitter = true,
    onRetry,
  } = options;

  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error as Error;

          // Only retry if the error is retryable
          const openClawError = error instanceof OpenClawError;
          const shouldRetry = !openClawError || (error as OpenClawError).retryable;

          if (!shouldRetry || attempt === maxAttempts) {
            throw error;
          }

          // Calculate backoff
          let delayMs: number;
          switch (backoffStrategy) {
            case 'linear':
              delayMs = backoffMs * attempt;
              break;
            case 'exponential':
              delayMs = backoffMs * Math.pow(2, attempt - 1);
              break;
            case 'fixed':
            default:
              delayMs = backoffMs;
          }

          // Add jitter to avoid thundering herd
          if (jitter) {
            delayMs = delayMs * (0.75 + Math.random() * 0.5);
          }

          if (onRetry) {
            onRetry(attempt, error as Error);
          }

          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      throw lastError;
    };
  };
}

// Circuit Breaker
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures to trip
  resetTimeoutMs: number;   // Time in ms before attempting to close again
  halfOpenMaxCalls: number; // Number of test calls in HALF_OPEN state
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private config: Required<CircuitBreakerConfig>;

  private static instanceCount = 0;
  private readonly instanceId: number;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      ...config,
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeoutMs: config.resetTimeoutMs ?? 60000,
      halfOpenMaxCalls: config.halfOpenMaxCalls ?? 3,
    } as Required<CircuitBreakerConfig>;
    this.instanceId = ++CircuitBreaker.instanceCount;
  }

  async execute<T>(
    fn: () => Promise<T>,
    fallback?: (error: Error) => Promise<T> | T
  ): Promise<T> {
    const now = Date.now();

    // Check if we should transition out of OPEN state
    if (this.state === 'OPEN') {
      if (now - this.lastFailureTime >= this.config.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        this.failureCount = 0;
      } else {
        if (fallback) {
          return fallback(new Error('Circuit breaker is OPEN'));
        }
        throw new Error('Circuit breaker is OPEN');
      }
    }

    // HALF_OPEN: allow limited test calls
    if (this.state === 'HALF_OPEN') {
      if (this.failureCount >= this.config.halfOpenMaxCalls) {
        if (fallback) {
          return fallback(new Error('Circuit breaker in HALF_OPEN, too many test failures'));
        }
        throw new Error('Circuit breaker in HALF_OPEN, too many test failures');
      }
    }

    try {
      const result = await fn();

      // Success: reset circuit breaker
      if (this.state !== 'CLOSED') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureTime = now;

      // Trip the circuit if threshold reached
      if (this.failureCount >= this.config.failureThreshold) {
        this.state = 'OPEN';
      }

      if (fallback) {
        return fallback(error as Error);
      }
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  isClosed(): boolean {
    return this.state === 'CLOSED';
  }

  isOpen(): boolean {
    return this.state === 'OPEN';
  }
}

// Error wrapping utility
export function wrapError(error: any, category: ErrorCategory, code: string, message?: string): OpenClawError {
  if (error instanceof OpenClawError) {
    return error;
  }

  const wrapped = new OpenClawError(message || error.message, {
    category,
    code,
    retryable: category === ErrorCategory.NETWORK || category === ErrorCategory.DATABASE || category === ErrorCategory.EXCHANGE,
    details: { original: error },
  });

  // Preserve stack trace
  if (error.stack) {
    wrapped.stack = error.stack;
  }

  return wrapped;
}

// Error code mapping
export const ERROR_MAP: Record<string, ErrorCategory> = {
  // Validation (1xxx)
  '1000': ErrorCategory.VALIDATION,
  '1001': ErrorCategory.VALIDATION,
  '1002': ErrorCategory.VALIDATION,
  // Network (2xxx)
  '2000': ErrorCategory.NETWORK,
  '2001': ErrorCategory.NETWORK,
  '2002': ErrorCategory.NETWORK,
  // Strategy (3xxx)
  '3000': ErrorCategory.STRATEGY,
  '3001': ErrorCategory.STRATEGY,
  '3002': ErrorCategory.STRATEGY,
  // Database (4xxx)
  '4000': ErrorCategory.DATABASE,
  '4001': ErrorCategory.DATABASE,
  '4002': ErrorCategory.DATABASE,
  // Exchange (5xxx)
  '5000': ErrorCategory.EXCHANGE,
  '5001': ErrorCategory.EXCHANGE,
  '5002': ErrorCategory.EXCHANGE,
  // File (6xxx)
  '6000': ErrorCategory.FILE,
  '6001': ErrorCategory.FILE,
  '6002': ErrorCategory.FILE,
  // Auth (7xxx)
  '7000': ErrorCategory.AUTH,
  '7001': ErrorCategory.AUTH,
  '7002': ErrorCategory.AUTH,
  // Internal (8xxx)
  '8000': ErrorCategory.INTERNAL,
  '8001': ErrorCategory.INTERNAL,
  '8002': ErrorCategory.INTERNAL,
  // Unknown (9xxx)
  '9000': ErrorCategory.UNKNOWN,
};

export function getErrorCategory(code: string): ErrorCategory {
  return ERROR_MAP[code] || ErrorCategory.UNKNOWN;
}
