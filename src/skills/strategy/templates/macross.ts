/**
 * MA Cross Strategy Template
 *
 * Simple moving average crossover strategy.
 * Long entry when fast MA crosses above slow MA.
 * Exit when fast MA crosses below slow MA.
 *
 * Best for: Trending markets, medium to high volatility
 * Risk: Medium. Whipsaws in ranging markets.
 */

import { StrategyTemplate, IndicatorConfig, Condition } from '../compiler';
import { ParameterSpaceBuilder, IntParameter, DecimalParameter, BooleanParameter } from '../parameters';

export interface MACrossParams {
  fast_period: number;
  slow_period: number;
  stoploss: number;
  trailing_stop?: boolean;
  trailing_stop_positive?: number;
  trailing_stop_positive_offset?: number;
}

/**
 * Default parameters for optimization
 */
export function getDefaultParams(): MACrossParams {
  return {
    fast_period: 10,
    slow_period: 21,
    stoploss: -0.1,
    trailing_stop: true,
    trailing_stop_positive: 0.02,
    trailing_stop_positive_offset: 0.04,
  };
}

/**
 * Parameter space for Hyperopt optimization
 */
export function getParameterSpace() {
  return new ParameterSpaceBuilder()
    .addInt('fast_period', 5, 50, 10, 'Fast MA period')
    .addInt('slow_period', 10, 200, 21, 'Slow MA period')
    .addDecimal('stoploss', -0.2, -0.02, -0.1, 0.01, 'Stop loss percentage')
    .addBoolean('trailing_stop', true, 'Enable trailing stop')
    .addDecimal('trailing_stop_positive', 0.01, 0.1, 0.03, 0.01, 'Trailing stop positive offset')
    .addDecimal('trailing_stop_positive_offset', 0.01, 0.2, 0.04, 0.01, 'Trailing stop positive offset')
    .build();
}

/**
 * Construct the MA Cross strategy template
 */
export function createMACrossStrategy(
  name: string = 'MA Cross',
  timeframe: string = '5m',
  customParams?: Partial<MACrossParams>
): StrategyTemplate {
  const params = { ...getDefaultParams(), ...customParams };
  const { trailing_stop, trailing_stop_positive, trailing_stop_positive_offset, ...coreParams } = params;

  return {
    name,
    description: 'Moving Average Crossover Strategy. Long when fast MA crosses above slow MA, exit on reverse cross.',
    className: 'MACrossStrategy',
    timeframe,
    GeminiTags: ['trend', 'momentum', 'classic'],
    version: '1.0.0',
    author: 'OpenClaw Quant',
    indicators: [
      {
        name: 'fast_ma',
        function: 'EMA',
        params: { timeperiod: params.fast_period },
        input: 'close',
        output: 'ema_fast',
      },
      {
        name: 'slow_ma',
        function: 'EMA',
        params: { timeperiod: params.slow_period },
        input: 'close',
        output: 'ema_slow',
      },
    ],
    entryConditions: [
      {
        left: 'ema_fast',
        operator: '>',
        right: 'ema_slow',
        rightIsColumn: true,
        logic: 'AND',
      },
    ],
    exitConditions: [
      {
        left: 'ema_fast',
        operator: '<',
        right: 'ema_slow',
        rightIsColumn: true,
        logic: 'AND',
      },
    ],
    parameters: {
      fast_period: params.fast_period,
      slow_period: params.slow_period,
      stoploss: params.stoploss,
      trailing_stop: trailing_stop ?? true,
      trailing_stop_positive: trailing_stop_positive ?? 0.02,
      trailing_stop_positive_offset: trailing_stop_positive_offset ?? 0.04,
    },
  };
}

export type { MACrossParams };
