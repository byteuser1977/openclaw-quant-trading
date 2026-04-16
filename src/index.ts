/**
 * OpenClaw Quant Trading Skills
 * 主入口模块
 *
 * 提供量化交易相关的所有核心功能：
 * - 配置管理 (Config)
 * - 日志系统 (Logger)
 * - 错误处理 (Errors)
 * - 技能接口 (Skills)
 *
 * @packageDocumentation
 */

// Core exports
export * from './core/config';
export * from './core/logger';
export * from './core/errors';
export * from './core/vault';
export * from './core/allowlist';

// Utils exports (to be implemented)
export * from './utils/retry';
export * from './utils/validation';

// Skills exports (to be implemented)
export * from './skills/strategy';
export * from './skills/backtesting';
export * from './skills/hyperopt';
export * from './skills/data';
export * from './skills/risk';
export * from './skills/exchange';
export * from './skills/persistence';
export * from './skills/reporting';

// Version
export const VERSION = '0.1.0';
