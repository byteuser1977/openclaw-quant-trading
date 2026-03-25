/**
 * OpenClaw Quant Trading - Structured Logging System
 *
 * Based on Winston with support for:
 * - Multiple transports: console, file, both
 * - Formats: JSON (production), pretty (development)
 * - Child loggers with context
 */

import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { getConfig } from './config';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  HTTP = 'http',
  VERBOSE = 'verbose',
  DEBUG = 'debug',
}

export interface LoggerOptions {
  level?: LogLevel;
  format?: 'json' | 'pretty';
  output?: 'console' | 'file' | 'both';
  logDir?: string;
  maxFiles?: number;
  maxSizeMB?: number;
}

class Logger {
  private static instance: winston.Logger | null = null;
  private transports: winston.transport[] = [];

  private constructor() {}

  static init(): void {
    if (Logger.instance) return;

    let config;
    try {
      config = getConfig().logging;
    } catch (e) {
      // Config not initialized yet, use defaults
      config = {
        level: 'info',
        format: 'pretty',
        output: 'console',
        logDir: 'logs',
        maxFiles: 10,
        maxSizeMB: 10,
      };
    }

    const transports: winston.transport[] = [];

    // Console transport
    if (config.output === 'console' || config.output === 'both') {
      transports.push(
        new winston.transports.Console({
          level: config.level,
          format: config.format === 'json'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.printf(({ level, message, timestamp, ...meta }) => {
                  return `${timestamp} [${level.toUpperCase()}] ${message} ${
                    Object.keys(meta).length ? JSON.stringify(meta) : ''
                  }`;
                })
              ),
        })
      );
    }

    // File transport
    if (config.output === 'file' || config.output === 'both') {
      const logDir = config.logDir || 'logs';
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Error log (always include)
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'error.log'),
          level: 'error',
          maxsize: config.maxSizeMB * 1024 * 1024,
          maxFiles: config.maxFiles,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          ),
        })
      );

      // Combined log
      transports.push(
        new winston.transports.File({
          filename: path.join(logDir, 'combined.log'),
          level: config.level,
          maxsize: config.maxSizeMB * 1024 * 1024,
          maxFiles: config.maxFiles,
          format: winston.format.json(),
        })
      );
    }

    Logger.instance = winston.createLogger({
      level: config.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        config.format === 'json' ? winston.format.json() : winston.format.prettyPrint()
      ),
      transports,
      exitOnError: false,
    });
  }

  static getLogger(name?: string): winston.Logger {
    if (!Logger.instance) {
      Logger.init();
    }
    const logger = name ? Logger.instance.child({ module: name }) : Logger.instance;
    return logger;
  }

  static error(message: string, ...args: any[]): void {
    Logger.getLogger().error(message, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    Logger.getLogger().warn(message, ...args);
  }

  static info(message: string, ...args: any[]): void {
    Logger.getLogger().info(message, ...args);
  }

  static http(message: string, ...args: any[]): void {
    Logger.getLogger().http(message, ...args);
  }

  static verbose(message: string, ...args: any[]): void {
    Logger.getLogger().verbose(message, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    Logger.getLogger().debug(message, ...args);
  }
}

export { Logger };
