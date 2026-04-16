/**
 * Parameter System for Hyperopt
 * 支持参数定义、验证、序列化（JSON Schema）
 */

/**
 * 参数类型枚举
 */
export enum ParameterType {
  INTEGER = 'integer',
  DECIMAL = 'decimal',
  BOOLEAN = 'boolean',
  CATEGORICAL = 'categorical'
}

/**
 * 参数基数（用于优化）
 */
export enum ParameterSpace {
  BUY = 'buy',
  SELL = 'sell',
  ROI = 'roi',
  PROTECTION = 'protection',
  COMMON = 'common'
}

/**
 * 参数选项基类
 */
export interface ParameterOptionsBase {
  default?: any;
  group?: ParameterSpace;
  description?: string;
}

/**
 * 整型参数选项
 */
export interface IntParameterOptions extends ParameterOptionsBase {
  step?: number;
}

/**
 * 浮点数参数选项
 */
export interface DecimalParameterOptions extends ParameterOptionsBase {
  precision?: number;
  step?: number;
}

/**
 * 布尔参数选项
 */
export interface BooleanParameterOptions extends ParameterOptionsBase {
  // 暂无额外选项
}

/**
 * 分类参数选项
 */
export interface CategoricalParameterOptions extends ParameterOptionsBase {
  options: string[];
}

/**
 * 参数元数据接口
 * 所有具体参数类需实现这些方法
 */
export interface ParameterMetadata {
  name: string;
  type: ParameterType;
  description?: string;
  default?: any;
  group: ParameterSpace;
  validate(value: any): { valid: boolean; error?: string };
  sample(): any;
  toJSON(): any;
}

/**
 * 整型参数
 * @example new IntParameter('rsi_period', 10, 30, { step: 2, default: 14 })
 */
export class IntParameter implements ParameterMetadata {
  public readonly type = ParameterType.INTEGER;
  public readonly group: ParameterSpace;

  constructor(
    public readonly name: string,
    public readonly min: number,
    public readonly max: number,
    public readonly options?: IntParameterOptions
  ) {
    if (min >= max) {
      throw new Error(`IntParameter: min (${min}) must be < max (${max})`);
    }
    this.group = options?.group ?? ParameterSpace.COMMON;
  }

  public get default(): number | undefined {
    return this.options?.default;
  }

  public get step(): number | undefined {
    return this.options?.step;
  }

  public get stepValue(): number {
    return this.step ?? 1;
  }

  /**
   * 验证值是否在范围内
   */
  public validate(value: any): { valid: boolean; error?: string } {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return { valid: false, error: `Value must be an integer` };
    }
    if (value < this.min || value > this.max) {
      return { valid: false, error: `Value ${value} out of range [${this.min}, ${this.max}]` };
    }
    if (this.step && (value - this.min) % this.step !== 0) {
      return { valid: false, error: `Value ${value} does not align with step ${this.step}` };
    }
    return { valid: true };
  }

  /**
   * 随机生成一个值（用于初始采样）
   */
  public sample(): number {
    const range = this.max - this.min;
    const steps = Math.floor(range / this.stepValue);
    const stepIndex = Math.floor(Math.random() * (steps + 1));
    return this.min + stepIndex * this.stepValue;
  }

  /**
   * 序列化为 JSON Schema
   */
  public toJSON(): any {
    return {
      name: this.name,
      type: this.type,
      min: this.min,
      max: this.max,
      step: this.step,
      default: this.default,
      description: this.options?.description ?? `Integer parameter ${this.name} (${this.min}-${this.max})`
    };
  }
}

/**
 * 浮点数参数
 * @example new DecimalParameter('stoploss', -0.2, -0.05, { precision: 0.001, default: -0.1 })
 */
export class DecimalParameter implements ParameterMetadata {
  public readonly type = ParameterType.DECIMAL;
  public readonly group: ParameterSpace;

  constructor(
    public readonly name: string,
    public readonly min: number,
    public readonly max: number,
    public readonly options?: DecimalParameterOptions
  ) {
    if (min >= max) {
      throw new Error(`DecimalParameter: min (${min}) must be < max (${max})`);
    }
    this.group = options?.group ?? ParameterSpace.COMMON;
  }

  public get default(): number | undefined {
    return this.options?.default;
  }

  public get precision(): number | undefined {
    return this.options?.precision;
  }

  public get step(): number | undefined {
    return this.options?.step;
  }

  public get stepValue(): number {
    if (this.step) return this.step;
    if (this.precision) return Math.pow(10, -this.precision);
    return 0.0001; // default step
  }

  public validate(value: any): { valid: boolean; error?: string } {
    if (typeof value !== 'number' || isNaN(value)) {
      return { valid: false, error: `Value must be a number` };
    }
    if (value < this.min || value > this.max) {
      return { valid: false, error: `Value ${value} out of range [${this.min}, ${this.max}]` };
    }
    if (this.precision) {
      const decimals = this.countDecimals(value);
      if (decimals > this.precision) {
        return { valid: false, error: `Value ${value} exceeds precision ${this.precision}` };
      }
    }
    return { valid: true };
  }

  private countDecimals(value: number): number {
    const str = value.toString();
    const dotIndex = str.indexOf('.');
    return dotIndex === -1 ? 0 : str.length - dotIndex - 1;
  }

  public sample(): number {
    const range = this.max - this.min;
    const steps = Math.floor(range / this.stepValue);
    const stepIndex = Math.floor(Math.random() * (steps + 1));
    const value = this.min + stepIndex * this.stepValue;
    if (this.precision) {
      return parseFloat(value.toFixed(this.precision));
    }
    return value;
  }

  public toJSON(): any {
    return {
      name: this.name,
      type: this.type,
      min: this.min,
      max: this.max,
      precision: this.precision,
      step: this.step,
      default: this.default,
      description: this.options?.description ?? `Decimal parameter ${this.name} (${this.min}-${this.max})`
    };
  }
}

/**
 * 布尔参数
 */
export class BooleanParameter implements ParameterMetadata {
  public readonly type = ParameterType.BOOLEAN;
  public readonly group: ParameterSpace;

  constructor(
    public readonly name: string,
    public readonly options?: BooleanParameterOptions
  ) {
    this.group = options?.group ?? ParameterSpace.COMMON;
  }

  public get default(): boolean | undefined {
    return this.options?.default;
  }

  public validate(value: any): { valid: boolean; error?: string } {
    if (typeof value !== 'boolean') {
      return { valid: false, error: `Value must be a boolean` };
    }
    return { valid: true };
  }

  public sample(): boolean {
    return Math.random() > 0.5;
  }

  public toJSON(): any {
    return {
      name: this.name,
      type: this.type,
      default: this.default,
      description: this.options?.description ?? `Boolean parameter ${this.name}`
    };
  }
}

/**
 * 分类参数
 */
export class CategoricalParameter implements ParameterMetadata {
  public readonly type = ParameterType.CATEGORICAL;
  public readonly group: ParameterSpace;

  constructor(
    public readonly name: string,
    public readonly options: string[],
    public readonly categoricalOptions?: CategoricalParameterOptions
  ) {
    if (options.length === 0) {
      throw new Error(`CategoricalParameter: at least one option required`);
    }
    this.group = categoricalOptions?.group ?? ParameterSpace.COMMON;
  }

  public get default(): string | undefined {
    return this.categoricalOptions?.default;
  }

  public validate(value: any): { valid: boolean; error?: string } {
    if (!this.options.includes(value)) {
      return { valid: false, error: `Value '${value}' not in options: ${this.options.join(', ')}` };
    }
    return { valid: true };
  }

  public sample(): string {
    const index = Math.floor(Math.random() * this.options.length);
    return this.options[index];
  }

  public toJSON(): any {
    return {
      name: this.name,
      type: this.type,
      options: this.options,
      default: this.default,
      description: this.categoricalOptions?.description ?? `Categorical parameter ${this.name}`
    };
  }
}

/**
 * 参数空间容器
 * 管理所有策略参数及其范围
 */
export class ParameterSpaceContainer {
  private parameters: ParameterMetadata[] = [];

  /**
   * 添加参数
   */
  add(param: ParameterMetadata): this {
    this.parameters.push(param);
    return this;
  }

  /**
   * 批量添加参数
   */
  addAll(params: ParameterMetadata[]): this {
    this.parameters.push(...params);
    return this;
  }

  /**
   * 根据名称获取参数
   */
  get(name: string): ParameterMetadata | undefined {
    return this.parameters.find(p => p.name === name);
  }

  /**
   * 获取所有参数
   */
  getAll(): ParameterMetadata[] {
    return [...this.parameters];
  }

  /**
   * 获取参数数量
   */
  get size(): number {
    return this.parameters.length;
  }

  /**
   * 验证参数字典
   */
  public validate(values: Record<string, any>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const param of this.getAll()) {
      if (param.name in values) {
        const result = param.validate(values[param.name]);
        if (!result.valid) {
          errors.push(`Parameter '${param.name}': ${result.error}`);
        }
      } else if (param.default === undefined) {
        errors.push(`Parameter '${param.name}' is required but not provided`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 生成随机参数采样
   */
  public sampleRandom(): Record<string, any> {
    const result: Record<string, any> = {};
    for (const param of this.getAll()) {
      result[param.name] = param.sample();
    }
    return result;
  }

  /**
   * 导出为 JSON Schema（用于 API 文档、前端表单生成）
   */
  public toJSONSchema(): any {
    return {
      type: 'object',
      properties: this.getAll().map(p => p.toJSON()),
      required: this.getAll().filter(p => p.default === undefined).map(p => p.name)
    };
  }
}
