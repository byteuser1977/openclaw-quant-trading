/**
 * Dollar Cost Averaging (DCA) Strategy
 *
 * Regularly invests a fixed amount regardless of price.
 * Buys at fixed intervals, accumulates position over time.
 * Exit when target profit reached (e.g., 20%).
 *
 * Best for: Long-term accumulation, bear market buying
 * Risk: Low-Medium. No market timing required, but requires patience.
 */

import { StrategyTemplate, IndicatorConfig, Condition } from '../compiler';
import { ParameterSpaceBuilder, IntParameter, DecimalParameter, BooleanParameter } from '../parameters';
import { StrategyBuilder } from '../index';

export interface DcaParams {
  interval_hours: number; // How often to buy (e.g., every 24h)
  amount_per_interval: number; // Fixed amount to invest each time
  max_total_investment: number; // Max total investment cap
  target_profit_pct: number; // Take profit threshold
  max_hold_days: number; // Maximum holding period
  use_stop_loss?: boolean;
  stop_loss_pct?: number;
}

/**
 * Default parameters
 */
export function getDefaultParams(): DcaParams {
  return {
    interval_hours: 24, // Daily
    amount_per_interval: 100, // $100 per interval
    max_total_investment: 5000, // $5k max
    target_profit_pct: 20.0, // 20% profit target
    max_hold_days: 365, // 1 year max
    use_stop_loss: false,
    stop_loss_pct: -10.0, // 10% stop loss if enabled
  };
}

/**
 * Parameter space for Hyperopt
 */
export function getParameterSpace() {
  return new ParameterSpaceBuilder()
    .addInt('interval_hours', 1, 168, 24, 'DCA interval in hours')
    .addDecimal('amount_per_interval', 10, 1000, 100, 10, 'Amount per DCA interval')
    .addDecimal('max_total_investment', 500, 50000, 5000, 500, 'Max total investment')
    .addDecimal('target_profit_pct', 5.0, 50.0, 20.0, 2.5, 'Take profit percentage')
    .addInt('max_hold_days', 30, 365, 365, 'Maximum holding days')
    .addBoolean('use_stop_loss', false, 'Enable stop loss')
    .addDecimal('stop_loss_pct', -20.0, -5.0, -10.0, 1.0, 'Stop loss percentage')
    .build();
}

/**
 * Create DCA strategy template
 */
export function createDcaStrategy(
  name: string = 'Dollar Cost Averaging',
  timeframe: string = '1d', // DCA typically uses daily or higher timeframe
  customParams?: Partial<DcaParams>
): StrategyTemplate {
  const params = { ...getDefaultParams(), ...customParams };

  // DCA requires custom buy scheduling logic (time-based, not price-based)
  // Entry conditions will be based on time elapsed since last buy
  return {
    name,
    description: `Dollar Cost Averaging strategy. Buys $${params.amount_per_interval} every ${params.interval_hours} hours ` +
                 `up to $${params.max_total_investment}. Exit at ${params.target_profit_pct}% profit.`,
    className: 'DcaStrategy',
    timeframe,
    GeminiTags: ['long-term', 'accumulation', 'passive'],
    version: '1.0.0',
    author: 'OpenClaw Quant',
    indicators: [
      // Need to track investment amount and average cost
      // These are not traditional indicators but state tracking
      {
        name: 'custom_investment_tracker',
        function: 'CUSTOM', // Will be implemented in populate_indicators
        params: {},
        input: 'close',
        output: 'investment_summary',
      },
    ],
    entryConditions: [], // Filled by custom time-based logic
    exitConditions: [
      // Exit when profit target reached
      {
        left: 'current_profit_pct',
        operator: '>=',
        right: params.target_profit_pct,
      },
    ],
    parameters: {
      interval_hours: params.interval_hours,
      amount_per_interval: params.amount_per_interval,
      max_total_investment: params.max_total_investment,
      target_profit_pct: params.target_profit_pct,
      max_hold_days: params.max_hold_days,
      use_stop_loss: params.use_stop_loss,
      stop_loss_pct: params.stop_loss_pct,
    },
  };
}

export type { DcaParams };
