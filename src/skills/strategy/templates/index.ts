/**
 * Strategy Templates - Pre-built strategy configurations
 *
 * This module provides ready-to-use strategy templates that can be
 * compiled to Freqtrade-compatible Python strategies.
 */

// Explicit exports to avoid name conflicts
export { createMACrossStrategy } from './macross';
export type { MACrossParams } from './macross';
export { createRsiMacdStrategy } from './rsi_macd';
export type { RsiMacdParams } from './rsi_macd';
export { createGridStrategy } from './grid';
export type { GridParams } from './grid';
export { createDcaStrategy } from './dca';
export type { DcaParams } from './dca';
export { createMlSkeletonStrategy } from './ml_skeleton';
export type { MlSkeletonParams } from './ml_skeleton';

// Template registry for easy discovery
import type { StrategyTemplate } from '../compiler';
import { createMACrossStrategy, type MACrossParams } from './macross';
import { createRsiMacdStrategy, type RsiMacdParams } from './rsi_macd';
import { createGridStrategy, type GridParams } from './grid';
import { createDcaStrategy, type DcaParams } from './dca';
import { createMlSkeletonStrategy, type MlSkeletonParams } from './ml_skeleton';

export interface TemplateInfo {
  name: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  timeframe: string;
  create: (params?: any) => StrategyTemplate;
}

export const TEMPLATE_REGISTRY: Record<string, TemplateInfo> = {
  'macross': {
    name: 'MA Cross',
    description: 'Simple moving average crossover. Classic trend-following strategy.',
    category: 'trend',
    difficulty: 'beginner',
    timeframe: 'any',
    create: (params?: Partial<MACrossParams>) => createMACrossStrategy('MA Cross', '5m', params),
  },
  'rsi_macd': {
    name: 'RSI + MACD',
    description: 'Combines RSI mean reversion with MACD trend confirmation.',
    category: 'momentum',
    difficulty: 'intermediate',
    timeframe: '1h',
    create: (params?: Partial<RsiMacdParams>) => createRsiMacdStrategy('RSI MACD', '1h', params),
  },
  'grid': {
    name: 'Grid Trading',
    description: 'Market-making style strategy placing orders on a price grid.',
    category: 'range-bound',
    difficulty: 'intermediate',
    timeframe: '5m-15m',
    create: (params?: Partial<GridParams>) => createGridStrategy('Grid Trading', '15m', params),
  },
  'dca': {
    name: 'Dollar Cost Averaging',
    description: 'Regular fixed-amount investing regardless of price. Long-term accumulation.',
    category: 'passive',
    difficulty: 'beginner',
    timeframe: '1d',
    create: (params?: Partial<DcaParams>) => createDcaStrategy('DCA', '1d', params),
  },
  'ml_skeleton': {
    name: 'Machine Learning Skeleton',
    description: 'Framework for custom ML models (XGBoost, LightGBM, etc.). Requires implementation.',
    category: 'predictive',
    difficulty: 'advanced',
    timeframe: '1h',
    create: (params?: Partial<MlSkeletonParams>) => createMlSkeletonStrategy('ML Skeleton', '1h', params),
  },
};

/**
 * Get template by key
 */
export function getTemplate(key: string): StrategyTemplate | null {
  const info = TEMPLATE_REGISTRY[key];
  if (!info) {
    return null;
  }
  return info.create();
}

/**
 * List all available templates
 */
export function listTemplates(): TemplateInfo[] {
  return Object.values(TEMPLATE_REGISTRY);
}
