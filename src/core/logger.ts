/**
 * 结构化日志系统
 * 基于 Winston，支持多 transports（控制台/文件）、级别过滤、JSON 格式
 */

import winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { getConfigValue } from './config';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty';
  output?: 'console' | 'file' | 'both';
  filePath?: string;
  maxFiles?: number;
  maxsize?: number;
  includeTimestamp?: boolean;
  includeMeta?: boolean;
}

/**
 * 自定义日志格式器
 */
const createFormat = (options: LoggerOptions) => {
  const baseFormat = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(info => {
      const { timestamp, level, message, meta } = info;

      if (options.format === 'json') {
        const logEntry: any = {
          timestamp,
          level,
          message
        };
        if (options.includeMeta && meta && Object.keys(meta).length > 0) {
          logEntry.meta = meta;
        }
        return JSON.stringify(logEntry);
      }

      // Pretty 格式（开发友好）
      const metaStr = options.includeMeta && meta
        ? ` ${JSON.stringify(meta, null, 2)}`
        : '';
      return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
    })
  );

  return winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    baseFormat
  );
};

/**
 * 创建 Transport
 */
const createTransports = (options: LoggerOptions) => {
  const transports: winston.transport[] = [];

  // Console Transport
  if (options.output === 'console' || options.output === 'both') {
    transports.push(
      new winston.transports.Console({
        stderrLevels: ['warn', 'error', 'fatal'],
        format: createFormat({ ...options, includeTimestamp: true })
      })
    );
  }

  // File Transport
  if ((options.output === 'file' || options.output === 'both') && options.filePath) {
    const logDir = options.filePath.includes('/')
      ? options.filePath.substring(0, options.filePath.lastIndexOf('/'))
      : 'logs';

    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    transports.push(
      new winston.transports.File({
        filename: options.filePath,
        level: options.level,
        maxsize: options.maxsize || 10485760, // 10MB
        maxFiles: options.maxFiles || 14,
        format: createFormat({ ...options, includeTimestamp: true })
      }),
      // Error file for errors and above
      new winston.transports.File({
        filename: logDir + '/error.log',
        level: 'error',
        maxsize: options.maxsize || 10485760,
        maxFiles: options.maxFiles || 14,
        format: createFormat({ ...options, includeTimestamp: true })
      })
    );
  }

  return transports;
};

/**
 * Logger 类
 */
export class Logger {
  private logger: winston.Logger;
  private context?: string;

  constructor(options: LoggerOptions = {}, context?: string) {

    // 从全局配置读取默认值
    const configLevel = getConfigValue<LogLevel>('logging.level');
    const configFormat = getConfigValue<'json' | 'pretty'>('logging.format');
    const configOutput = getConfigValue<'console' | 'file' | 'both'>('logging.output');
    const configFilePath = getConfigValue<string>('logging.filePath');

    const finalOptions: LoggerOptions = {
      level: options.level ?? configLevel ?? 'info',
      format: options.format ?? configFormat ?? 'json',
      output: options.output ?? configOutput ?? 'console',
      filePath: options.filePath ?? configFilePath ?? 'logs/app.log',
      maxFiles: options.maxFiles ?? 14,
      maxsize: options.maxsize ?? 10485760,
      includeTimestamp: true,
      includeMeta: true
    };

    this.logger = winston.createLogger({
      level: finalOptions.level,
      format: createFormat(finalOptions),
      transports: createTransports(finalOptions),
      exitOnError: false
    });

    this.context = context;

    // 开发环境添加 pretty console format
    if (process.env.NODE_ENV !== 'production' && finalOptions.format === 'pretty') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  private withContext(meta: any = {}): any {
    const base = this.context ? { context: this.context } : {};
    return { ...base, ...meta };
  }

  trace(message: string, meta?: any): void {
    this.logger.log('trace', message, this.withContext(meta));
  }

  debug(message: string, meta?: any): void {
    this.logger.log('debug', message, this.withContext(meta));
  }

  info(message: string, meta?: any): void {
    this.logger.log('info', message, this.withContext(meta));
  }

  warn(message: string, meta?: any): void {
    this.logger.log('warn', message, this.withContext(meta));
  }

  error(message: string, error?: Error, meta?: any): void {
    const metaWithError = {
      ...this.withContext(meta),
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      }
    };
    this.logger.log('error', message, metaWithError);
  }

  fatal(message: string, error?: Error, meta?: any): void {
    const metaWithError = {
      ...this.withContext(meta),
      error: {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      }
    };
    this.logger.log('fatal', message, metaWithError);
  }

  // 子日志器（带上下文）
  child(context: string): Logger {
    return new Logger({}, context);
  }

  // Winston 实例访问（用于高级用例）
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}

/**
 * 全局日志器实例
 */
let globalLogger: Logger | null = null;

/**
 * 初始化全局日志器
 */
export function initLogger(options?: LoggerOptions): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(options);
  }
  return globalLogger;
}

/**
 * 获取日志器实例
 */
export function getLogger(context?: string): Logger {
  if (!globalLogger) {
    globalLogger = new Logger({}, context);
  } else if (context) {
    return globalLogger.child(context);
  }
  return globalLogger;
}

// 便捷方法导出
export const log = {
  trace: (msg: string, meta?: any) => getLogger().trace(msg, meta),
  debug: (msg: string, meta?: any) => getLogger().debug(msg, meta),
  info: (msg: string, meta?: any) => getLogger().info(msg, meta),
  warn: (msg: string, meta?: any) => getLogger().warn(msg, meta),
  error: (msg: string, err?: Error, meta?: any) => getLogger().error(msg, err, meta),
  fatal: (msg: string, err?: Error, meta?: any) => getLogger().fatal(msg, err, meta)
};

export { winston };
