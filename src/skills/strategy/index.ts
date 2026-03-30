/**
 * Strategy Skill - Main Entry Point
 *
 * Provides strategy development capabilities:
 * - Parameter space definition
 * - Technical indicator calculation
 * - Strategy compilation to Python
 * - Strategy validation
 */

export * from './parameters';
export * from './indicators';
export * from './compiler';
export * from './validator';
export * from './templates';

// Re-exports for convenience
import { ParameterSpace } from './parameters';
import { IndicatorConfig, OHLCV, getIndicatorEngine } from './indicators';
import { StrategyTemplate, Condition, ConditionNode, CompiledStrategy, compileStrategy, getStrategyCompiler } from './compiler';
import { validateStrategy, ValidationResult, getStrategyValidator } from './validator';

/**
 * High-level Strategy Builder API
 * Makes it easier to construct strategies programmatically
 */
export class StrategyBuilder {
  private template: StrategyTemplate;

  constructor(name: string, description?: string) {
    this.template = {
      name,
      description,
      timeframe: '5m', // default
      indicators: [],
      entryConditions: [],
      exitConditions: [],
      parameters: {},
    };
  }

  setTimeframe(timeframe: string): this {
    this.template.timeframe = timeframe;
    return this;
  }

  addIndicator(config: IndicatorConfig): this {
    this.template.indicators.push(config);
    return this;
  }

  addEntryCondition(condition: Condition): this {
    this.template.entryConditions.push(condition);
    return this;
  }

  addExitCondition(condition: Condition): this {
    this.template.exitConditions.push(condition);
    return this;
  }

  addParameter(key: string, value: any): this {
    this.template.parameters[key] = value;
    return this;
  }

  setParameters(params: Record<string, any>): this {
    this.template.parameters = { ...this.template.parameters, ...params };
    return this;
  }

  setTrailingStop(enabled: boolean = true, positive: number = 0.02, offset: number = 0.04): this {
    this.template.parameters.trailing_stop = enabled;
    if (enabled) {
      this.template.parameters.trailing_stop_positive = positive;
      this.template.parameters.trailing_stop_positive_offset = offset;
    }
    return this;
  }

  setStopLoss(pct: number): this {
    this.template.parameters.stoploss = pct;
    return this;
  }

  compile(): CompiledStrategy {
    return compileStrategy(this.template);
  }

  async validate(): Promise<ValidationResult> {
    return validateStrategy(this.template);
  }

  // Convenience methods for common pattern (e.g., moving average cross)
  static createMACross(
    name: string,
    fastPeriod: number = 10,
    slowPeriod: number = 21,
    timeframe: string = '5m'
  ): StrategyBuilder {
    const builder = new StrategyBuilder(name, `MA Cross Strategy (${fastPeriod}/${slowPeriod})`);
    builder.setTimeframe(timeframe);

    // Add indicators
    builder.addIndicator({
      name: 'ema_fast',
      function: 'EMA',
      params: { timeperiod: fastPeriod },
      input: 'close',
      output: 'ema_fast',
    });
    builder.addIndicator({
      name: 'ema_slow',
      function: 'EMA',
      params: { timeperiod: slowPeriod },
      input: 'close',
      output: 'ema_slow',
    });

    // Entry: fast crosses above slow
    builder.addEntryCondition({
      left: 'ema_fast',
      operator: '>',
      right: 'ema_slow',
    });

    // Exit: fast crosses below slow
    builder.addExitCondition({
      left: 'ema_fast',
      operator: '<',
      right: 'ema_slow',
    });

    // Default parameters
    builder.setParameters({
      stoploss: -0.1,
    });

    return builder;
  }

  static createRSIStrategy(
    name: string,
    rsiPeriod: number = 14,
    oversold: number = 30,
    overbought: number = 70,
    timeframe: string = '5m'
  ): StrategyBuilder {
    const builder = new StrategyBuilder(name, `RSI Mean Reversion Strategy`);
    builder.setTimeframe(timeframe);

    builder.addIndicator({
      name: 'rsi',
      function: 'RSI',
      params: { timeperiod: rsiPeriod },
      input: 'close',
      output: 'rsi',
    });

    // Entry: RSI oversold
    builder.addEntryCondition({
      left: 'rsi',
      operator: '<',
      right: oversold,
    });

    // Exit: RSI overbought
    builder.addExitCondition({
      left: 'rsi',
      operator: '>',
      right: overbought,
    });

    builder.setParameters({
      stoploss: -0.15,
    });

    return builder;
  }

  static createMACDStrategy(
    name: string,
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9,
    timeframe: string = '5m'
  ): StrategyBuilder {
    const builder = new StrategyBuilder(name, `MACD Crossover Strategy`);
    builder.setTimeframe(timeframe);

    builder.addIndicator({
      name: 'macd',
      function: 'MACD',
      params: { fastperiod: fastPeriod, slowperiod: slowPeriod, signalperiod: signalPeriod },
      input: 'close',
      output: 'macd_line',
    });
    builder.addIndicator({
      name: 'macd_signal',
      function: 'MACD',
      params: { fastperiod: fastPeriod, slowperiod: slowPeriod, signalperiod: signalPeriod },
      input: 'close',
      output: 'signal_line',
    });

    // Entry: MACD crosses above signal
    builder.addEntryCondition({
      left: 'macd_line',
      operator: '>',
      right: 'signal_line',
      rightIsColumn: true,
    });

    // Exit: MACD crosses below signal
    builder.addExitCondition({
      left: 'macd_line',
      operator: '<',
      right: 'signal_line',
      rightIsColumn: true,
    });

    builder.setParameters({
      stoploss: -0.12,
    });

    return builder;
  }
}

// Utility functions
export function getParameterFromSpace(space: ParameterSpace, name: string): any {
  const param = space[name];
  if (!param) {
    throw new Error(`Parameter "${name}" not found in space`);
  }
  return param.default !== undefined ? param.default : null;
}

export function mergeTemplates(...templates: StrategyTemplate[]): StrategyTemplate {
  if (templates.length === 0) {
    throw new Error('At least one template required');
  }
  const base = templates[0];
  const merged: StrategyTemplate = {
    name: base.name,
    description: base.description,
    timeframe: base.timeframe,
    indicators: [...base.indicators],
    entryConditions: [...base.entryConditions],
    exitConditions: [...base.exitConditions],
    parameters: { ...base.parameters },
  };

  for (let i = 1; i < templates.length; i++) {
    const t = templates[i];
    merged.indicators.push(...t.indicators);
    merged.entryConditions.push(...t.entryConditions);
    merged.exitConditions.push(...t.exitConditions);
    merged.parameters = { ...merged.parameters, ...t.parameters };
  }

  return merged;
}
