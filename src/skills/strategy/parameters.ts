/**
 * Strategy Parameter System
 *
 * Supports hyperparameter definition for strategy optimization.
 * Compatible with Hyperopt and Freqtrade parameter syntax.
 */

export type ParameterType = 'int' | 'decimal' | 'boolean' | 'categorical';

export interface ParameterDefinition<T = any> {
  name: string;
  type: ParameterType;
  default?: T;
  description?: string;
  // For numeric types
  low?: number;
  high?: number;
  step?: number;
  // For categorical
  choices?: any[];
  // For boolean
  // No extra fields needed
}

export class Parameter<T = any> {
  public readonly name: string;
  public readonly type: ParameterType;
  public readonly default?: T;
  public readonly description?: string;
  public readonly low?: number;
  public readonly high?: number;
  public readonly step?: number;
  public readonly choices?: any[];

  constructor(def: ParameterDefinition<T>) {
    this.name = def.name;
    this.type = def.type;
    this.default = def.default;
    this.description = def.description;

    if (def.type === 'int' || def.type === 'decimal') {
      if (def.low === undefined || def.high === undefined) {
        throw new Error(`Numeric parameter "${def.name}" requires low and high bounds`);
      }
      this.low = def.low;
      this.high = def.high;
      this.step = def.step;
    }

    if (def.type === 'categorical') {
      if (!def.choices || def.choices.length === 0) {
        throw new Error(`Categorical parameter "${def.name}" requires choices array`);
      }
      this.choices = def.choices;
    }
  }

  validate(value: any): boolean {
    switch (this.type) {
      case 'int':
        return Number.isInteger(value) && value >= (this.low ?? 0) && value <= (this.high ?? Infinity);
      case 'decimal':
        return typeof value === 'number' && !isNaN(value) && value >= (this.low ?? -Infinity) && value <= (this.high ?? Infinity);
      case 'boolean':
        return typeof value === 'boolean';
      case 'categorical':
        return this.choices!.includes(value);
      default:
        return false;
    }
  }

  toJSON(): ParameterDefinition<T> {
    const def: ParameterDefinition<T> = {
      name: this.name,
      type: this.type,
      default: this.default,
      description: this.description,
    };
    if (this.low !== undefined) def.low = this.low as any;
    if (this.high !== undefined) def.high = this.high as any;
    if (this.step !== undefined) def.step = this.step as any;
    if (this.choices !== undefined) def.choices = this.choices as any;
    return def;
  }
}

// Concrete parameter classes for type safety
export class IntParameter extends Parameter<number> {
  constructor(
    name: string,
    low: number,
    high: number,
    defaultVal?: number,
    description?: string
  ) {
    super({
      name,
      type: 'int',
      low,
      high,
      default: defaultVal,
      description,
    });
    if (defaultVal !== undefined && !this.validate(defaultVal)) {
      throw new Error(`Default value ${defaultVal} is out of bounds [${low}, ${high}]`);
    }
  }
}

export class DecimalParameter extends Parameter<number> {
  constructor(
    name: string,
    low: number,
    high: number,
    defaultVal?: number,
    step?: number,
    description?: string
  ) {
    super({
      name,
      type: 'decimal',
      low,
      high,
      step,
      default: defaultVal,
      description,
    });
    if (defaultVal !== undefined && !this.validate(defaultVal)) {
      throw new Error(`Default value ${defaultVal} is out of bounds [${low}, ${high}]`);
    }
  }
}

export class BooleanParameter extends Parameter<boolean> {
  constructor(
    name: string,
    defaultVal: boolean = false,
    description?: string
  ) {
    super({
      name,
      type: 'boolean',
      default: defaultVal,
      description,
    });
  }
}

export class CategoricalParameter extends Parameter<any> {
  constructor(
    name: string,
    choices: any[],
    defaultVal?: any,
    description?: string
  ) {
    super({
      name,
      type: 'categorical',
      choices,
      default: defaultVal,
      description,
    });
    if (defaultVal !== undefined && !this.validate(defaultVal)) {
      throw new Error(`Default value ${defaultVal} is not in choices ${choices.join(', ')}`);
    }
  }
}

// Parameter space management
export interface ParameterSpace {
  [key: string]: Parameter;
}

export class ParameterSpaceBuilder {
  private parameters: ParameterSpace = {};

  addParameter(param: Parameter): this {
    if (this.parameters[param.name]) {
      throw new Error(`Parameter "${param.name}" already exists in space`);
    }
    this.parameters[param.name] = param;
    return this;
  }

  addInt(name: string, low: number, high: number, defaultVal?: number, description?: string): this {
    return this.addParameter(new IntParameter(name, low, high, defaultVal, description));
  }

  addDecimal(name: string, low: number, high: number, defaultVal?: number, step?: number, description?: string): this {
    return this.addParameter(new DecimalParameter(name, low, high, defaultVal, step, description));
  }

  addBoolean(name: string, defaultVal: boolean = false, description?: string): this {
    return this.addParameter(new BooleanParameter(name, defaultVal, description));
  }

  addCategorical(name: string, choices: any[], defaultVal?: any, description?: string): this {
    return this.addParameter(new CategoricalParameter(name, choices, defaultVal, description));
  }

  build(): ParameterSpace & {
    validate: (values: Record<string, any>) => { valid: boolean; errors: string[] };
    generateRandomSample: (rng?: () => number) => Record<string, any>;
  } {
    const space: ParameterSpace & {
      validate: (values: Record<string, any>) => { valid: boolean; errors: string[] };
      generateRandomSample: (rng?: () => number) => Record<string, any>;
    } = { ...this.parameters };
    space.validate = this.validate.bind(this);
    space.generateRandomSample = this.generateRandomSample.bind(this);
    return space;
  }

  toJSON(): ParameterDefinition[] {
    return Object.values(this.parameters).map((p) => p.toJSON());
  }

  validate(values: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const [name, param] of Object.entries(this.parameters)) {
      if (values[name] === undefined) {
        if (param.default !== undefined) {
          values[name] = param.default;
        } else {
          errors.push(`Missing required parameter: ${name}`);
          continue;
        }
      }
      if (!param.validate(values[name])) {
        errors.push(`Invalid value for parameter "${name}": ${values[name]}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  generateRandomSample(rng: () => number = Math.random): Record<string, any> {
    const sample: Record<string, any> = {};
    for (const [name, param] of Object.entries(this.parameters)) {
      if (param.default !== undefined && rng() < 0.1) {
        // 10% chance to use default (exploration)
        sample[name] = param.default;
        continue;
      }
      switch (param.type) {
        case 'int':
          sample[name] = Math.floor(rng() * (param.high! - param.low! + 1)) + param.low!;
          break;
        case 'decimal':
          const range = param.high! - param.low!;
          sample[name] = param.low! + rng() * range;
          if (param.step) {
            sample[name] = Math.round(sample[name] / param.step) * param.step;
          }
          break;
        case 'boolean':
          sample[name] = rng() < 0.5;
          break;
        case 'categorical':
          sample[name] = param.choices![Math.floor(rng() * param.choices!.length)];
          break;
      }
    }
    return sample;
  }
}

// Freqtrade-style parameter definitions
export namespace StrategyParameters {
  export function roiStep(min: number = 0.01, max: number = 0.1, step: number = 0.01): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder().addDecimal('roi_step', min, max, 0.05, step, 'ROI step size');
  }

  export function stoploss(min: number = -0.2, max: number = -0.02, step: number = 0.01): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder().addDecimal('stoploss', min, max, -0.1, step, 'Stop loss percentage');
  }

  export function trailingStop(enableProb: number = 0.5): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder()
      .addBoolean('trailing_stop', false, 'Enable trailing stop')
      .addDecimal('trailing_stop_positive', 0.01, 0.1, 0.03, 0.01, 'Trailing stop positive offset')
      .addDecimal('trailing_stop_positive_offset', 0.01, 0.2, 0.04, 0.01, 'Trailing stop positive offset');
  }

  export function rsiPeriod(low: number = 10, high: number = 50, defaultVal?: number): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder().addInt('rsi_period', low, high, defaultVal ?? 14, 'RSI calculation period');
  }

  export function emaPeriods(low: number = 5, high: number = 50): ParameterSpaceBuilder {
    const builder = new ParameterSpaceBuilder();
    builder.addInt('ema_fast', low, high, 10, 'Fast EMA period');
    builder.addInt('ema_slow', low, high, 21, 'Slow EMA period');
    return builder;
  }

  export function macdParams(): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder()
      .addInt('macd_fast', 8, 20, 12, 'MACD fast EMA period')
      .addInt('macd_slow', 20, 40, 26, 'MACD slow EMA period')
      .addInt('macd_signal', 5, 15, 9, 'MACD signal line period');
  }

  export function bbandsParams(): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder()
      .addInt('bbands_period', 10, 50, 20, 'Bollinger Bands period')
      .addDecimal('bbands_std', 1.5, 3.0, 2.0, 0.1, 'Bollinger Bands standard deviation');
  }

  export function atrParams(): ParameterSpaceBuilder {
    return new ParameterSpaceBuilder().addInt('atr_period', 10, 30, 14, 'ATR calculation period');
  }
}

// Factory function for common parameter templates
export function createParameterSpace(
  name: string,
  parameters: (() => ParameterSpaceBuilder) | ParameterSpaceBuilder
): ParameterSpace {
  if (typeof parameters === 'function') {
    return parameters().build();
  }
  return parameters.build();
}

export function mergeParameterSpaces(...spaces: ParameterSpace[]): ParameterSpace {
  const merged: ParameterSpace = {};
  for (const space of spaces) {
    for (const [name, param] of Object.entries(space)) {
      if (merged[name]) {
        console.warn(`Parameter "${name}" overwritten during merge`);
      }
      merged[name] = param;
    }
  }
  return merged;
}
