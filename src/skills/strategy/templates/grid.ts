/**
 * Grid Trading Strategy
 *
 * Places buy and sell orders at regular intervals within a price range.
 * Buys at lower grid levels, sells at upper grid levels.
 * Profits from volatility without predicting direction.
 *
 * Best for: Ranging markets, low-to-medium trend
 * Risk: Medium. Can be dangerous in strong trending markets (all buys or all sells).
 */

import { StrategyTemplate, IndicatorConfig, Condition, ConditionNode } from '../compiler';
import { ParameterSpaceBuilder, IntParameter, DecimalParameter, BooleanParameter } from '../parameters';

export interface GridParams {
  grid_levels: number;
  grid_spacing_pct: number;
  base_price_mode: 'auto' | 'manual';
  base_price?: number;
  max_position_size: number;
  stoploss: number;
  use_trailing_stop?: boolean;
}

/**
 * Default parameters
 */
export function getDefaultParams(): GridParams {
  return {
    grid_levels: 10,
    grid_spacing_pct: 1.0, // 1% spacing
    base_price_mode: 'auto',
    max_position_size: 1000, // In quote currency
    stoploss: -0.15, // Overall position stoploss
    use_trailing_stop: false,
  };
}

/**
 * Parameter space for Hyperopt
 */
export function getParameterSpace() {
  return new ParameterSpaceBuilder()
    .addInt('grid_levels', 5, 30, 10, 'Number of grid levels')
    .addDecimal('grid_spacing_pct', 0.5, 5.0, 1.0, 0.1, 'Grid spacing percentage')
    .addCategorical('base_price_mode', ['auto', 'manual'], 'auto', 'Base price calculation mode')
    .addDecimal('max_position_size', 100, 10000, 1000, 100, 'Max position size')
    .addDecimal('stoploss', -0.3, -0.05, -0.15, 0.01, 'Overall stop loss')
    .addBoolean('use_trailing_stop', false, 'Enable trailing stop')
    .build();
}

/**
 * Create Grid Trading strategy template
 *
 * NOTE: This strategy requires custom Python logic to manage multiple orders.
 * The template generates a skeleton; actual grid order management must be
 * implemented in populate_* methods (or via external order manager).
 */
export function createGridStrategy(
  name: string = 'Grid Trading',
  timeframe: string = '15m',
  customParams?: Partial<GridParams>
): StrategyTemplate {
  const params = { ...getDefaultParams(), ...customParams };

  // Grid strategy requires custom order management logic that cannot be expressed
  // purely with conditions. We'll generate a template that includes helper methods.
  return {
    name,
    description: `Grid trading strategy with ${params.grid_levels} levels and ${params.grid_spacing_pct}% spacing. ` +
                 `Base price: ${params.base_price_mode} mode.`,
    className: 'GridStrategy',
    timeframe,
    GeminiTags: ['range-bound', 'market-making', 'volatility'],
    version: '1.0.0',
    author: 'OpenClaw Quant',
    indicators: [
      // Grid strategy needs VWAP or recent price average as base
      {
        name: 'vwap',
        function: 'VWAP',
        params: {},
        input: 'close',
        output: 'vwap',
      },
      // ATX for dynamic grid spacing adjustment (optional)
      {
        name: 'atr',
        function: 'ATR',
        params: { timeperiod: 14 },
        input: 'close',
        output: 'atr',
      },
    ],
    // Grid strategies use custom order management, not simple conditions
    entryConditions: [], // Populated via custom logic
    exitConditions: [], // Populated via custom logic
    parameters: {
      grid_levels: params.grid_levels,
      grid_spacing_pct: params.grid_spacing_pct,
      base_price_mode: params.base_price_mode,
      base_price: params.base_price,
      max_position_size: params.max_position_size,
      stoploss: params.stoploss,
      use_trailing_stop: params.use_trailing_stop,
    },
  };
}

export type { GridParams };
