/**
 * OpenClaw Quant Trading Skills
 *
 * A comprehensive suite of skills for quantitative trading,
 * integrating Freqtrade with OpenClaw ecosystem.
 *
 * @version 0.1.0
 * @license MIT
 */

// Version
export const VERSION = '0.1.0';

// Core modules
export * from './core/config';
export * from './core/logger';
export * from './core/errors';
export * from './core/vault';
export * from './core/allowlist';

// Strategy skill (to be implemented)
export * from './skills/strategy';

// New modules
export * from './skills/data';
export * from './skills/risk';
export * from './skills/risk/integration';
export * from './skills/exchange/adapter';

// Utils (to be implemented)
// export * from './utils/retry';
// export * from './utils/validation';
