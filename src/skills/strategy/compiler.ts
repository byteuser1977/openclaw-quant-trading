/**
 * Strategy Compiler
 *
 * Generates executable Python strategy files for Freqtrade from declarative configuration.
 * Produces standard IStrategy-compatible Python classes.
 */

import { ParameterSpace } from './parameters';
import { IndicatorConfig } from './indicators';
import { Logger } from '../../core/logger';

export interface CompiledStrategy {
  code: string;
  className: string;
  fileName: string;
  imports: string[];
  indicators: IndicatorConfig[];
  parameters: Record<string, any>;
}

export interface StrategyTemplate {
  name: string;
  description?: string;
  className?: string;
  timeframe: string;
  indicators: IndicatorConfig[];
  entryConditions: (Condition | ConditionNode)[];
  exitConditions: (Condition | ConditionNode)[];
  parameters: Record<string, any>;
  GeminiTags?: string[]; // For hyperopt grouping
  version?: string;
  author?: string;
}

export type LogicOperator = 'AND' | 'OR';

export interface Condition {
  left: string;
  operator: '<' | '<=' | '>' | '>=' | '==' | '!=';
  right: number | string;
  rightIsColumn?: boolean;
  logic?: LogicOperator; // Default AND
}

/**
 * 条件组合节点（支持嵌套逻辑）
 */
export interface ConditionNode {
  type: 'condition' | 'group';
  logic?: LogicOperator; // Only for group
  condition?: Condition;
  children?: ConditionNode[];
}

export class StrategyCompiler {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getLogger('compiler');
  }

  compile(template: StrategyTemplate): CompiledStrategy {
    this.logger.info(`Compiling strategy: ${template.name}`);

    const className = template.className || this.toPascalCase(template.name);
    const fileName = `${this.toSnakeCase(template.name)}.py`;

    // Generate Python code
    const code = this.generatePythonCode(template, className);

    return {
      code,
      className,
      fileName,
      imports: this.generateImports(template),
      indicators: template.indicators,
      parameters: template.parameters,
    };
  }

  private generatePythonCode(template: StrategyTemplate, className: string): string {
    const imports = this.generateImports(template).join('\n');
    const paramLines = this.generateParameterLines(template.parameters);
    const startupCandles = this.calculateStartupCandles(template.indicators);
    const indicatorLines = this.generateIndicatorLines(template.indicators);
    const entryLines = this.generateConditionLines(template.entryConditions, 'entry');
    const exitLines = this.generateConditionLines(template.exitConditions, 'exit');
    const hyperoptSpace = this.generateHyperoptSpace(template);

    const lines: string[] = [];

    // Shebang and imports
    lines.push(`#!/usr/bin/env python3`);
    lines.push(`# -*- coding: utf-8 -*-`);
    lines.push(`"""`);
    lines.push(`Auto-generated strategy by OpenClaw Quant Skills.`);
    lines.push(``);
    lines.push(`Strategy: ${template.name}`);
    if (template.description) lines.push(`Description: ${template.description}`);
    lines.push(`Timeframe: ${template.timeframe}`);
    if (template.author) lines.push(`Author: ${template.author}`);
    if (template.version) lines.push(`Version: ${template.version}`);
    lines.push(`"""`);
    lines.push(``);
    lines.push(imports);
    lines.push(``);

    // Class definition
    lines.push(`class ${className}(IStrategy):`);
    lines.push(`    """${template.description || 'Auto-generated strategy'}"""`);
    lines.push(``);
    lines.push(`    # Interface version`);
    lines.push(`    INTERFACE_VERSION = 3`);
    lines.push(``);
    lines.push(`    # Timeframe`);
    lines.push(`    timeframe = "${template.timeframe}"`);
    lines.push(``);
    lines.push(`    # Startup candle count (ensure indicators have enough data)`);
    lines.push(`    startup_candle_count = ${startupCandles}`);
    lines.push(``);

    // Parameters
    if (paramLines) {
      lines.push(`    # Strategy parameters`);
      paramLines.split('\n').forEach(l => lines.push(`    ${l}`));
      lines.push(``);
    }

    // ROI table
    lines.push(`    # ROI table`);
    lines.push(`    minimal_roi = {`);
    lines.push(`        "60": 0.01,`);
    lines.push(`        "30": 0.02,`);
    lines.push(`        "0": 0.04`);
    lines.push(`    }`);
    lines.push(``);

    // Stoploss & trailing
    const stoplossVal = (template.parameters && template.parameters.stoploss) !== undefined ? template.parameters.stoploss : -0.1;
    lines.push(`    # Stop loss`);
    lines.push(`    stoploss = ${stoplossVal}`);
    lines.push(``);

    if (template.parameters && template.parameters.trailing_stop) {
      lines.push(`    # Trailing stop`);
      lines.push(`    trailing_stop = True`);
      lines.push(`    trailing_stop_positive = ${template.parameters.trailing_stop_positive ?? 0.02}`);
      lines.push(`    trailing_stop_positive_offset = ${template.parameters.trailing_stop_positive_offset ?? 0.04}`);
      lines.push(``);
    } else {
      lines.push(`    # Trailing stop`);
      lines.push(`    trailing_stop = False`);
      lines.push(``);
    }

    lines.push(`    # Process only new candles`);
    lines.push(`    process_only_new_candles = True`);
    lines.push(``);
    lines.push(`    # Order types`);
    lines.push(`    order_types = {`);
    lines.push(`        "entry": "limit",`);
    lines.push(`        "exit": "limit",`);
    lines.push(`        "stoploss": "market",`);
    lines.push(`        "stoploss_on_exchange": True,`);
    lines.push(`    }`);
    lines.push(``);

    // populate_indicators
    lines.push(`    def populate_indicators(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:`);
    lines.push(`        """Add technical indicators to the dataframe."""`);
    if (indicatorLines) {
      indicatorLines.split('\n').forEach(l => lines.push(`        ${l}`));
    } else {
      lines.push(`        # No indicators defined`);
    }
    lines.push(`        return dataframe`);
    lines.push(``);

    // populate_entry_trend
    lines.push(`    def populate_entry_trend(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:`);
    lines.push(`        """Based on TA indicators, populate the entry signal."""`);
    entryLines.split('\n').forEach(l => lines.push(`        ${l}`));
    lines.push(`        return dataframe`);
    lines.push(``);

    // populate_exit_trend
    lines.push(`    def populate_exit_trend(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:`);
    lines.push(`        """Based on TA indicators, populate the exit signal."""`);
    exitLines.split('\n').forEach(l => lines.push(`        ${l}`));
    lines.push(`        return dataframe`);
    lines.push(``);

    // informative_pairs
    lines.push(`    def informative_pairs(self) -> List[Tuple[str, str]]:`);
    lines.push(`        """Define additional informative pairs for strategy."""`);
    lines.push(`        return []`);
    lines.push(``);

    // custom_stoploss
    lines.push(`    def custom_stoploss(self, pair: str, trade: 'Trade', current_time: datetime, current_rate: float, current_profit: float, **kwargs) -> float:`);
    lines.push(`        # Custom stoploss logic can be added here`);
    lines.push(`        return self.stoploss`);
    lines.push(``);

    // custom_entry
    lines.push(`    def custom_entry(self, pair: str, current_time: datetime, current_rate: float, **kwargs) -> Tuple[bool, str]:`);
    lines.push(`        # Custom entry signal can be added here`);
    lines.push(`        return False, ''`);
    lines.push(``);

    // custom_exit
    lines.push(`    def custom_exit(self, pair: str, trade: 'Trade', current_time: datetime, current_rate: float, **kwargs) -> Optional[Tuple[bool, str]]:`);
    lines.push(`        # Custom exit signal can be added here`);
    lines.push(`        return None`);
    lines.push(``);

    // Hyperopt parameters if any
    if (hyperoptSpace) {
      lines.push(`    @staticmethod`);
      lines.push(`    def hyperopt_parameters():`);
      lines.push(`        return {`);
      const paramEntries = Object.entries(template.parameters).filter(([_, def]) => {
        return def && typeof def === 'object' && 'hyperopt' in (def as any);
      });
      for (const [name, def] of paramEntries) {
        const h = (def as any).hyperopt;
        if (h.type === 'int') {
          lines.push(`            '${name}': Integer(${h.min}, ${h.max}),`);
        } else if (h.type === 'float') {
          lines.push(`            '${name}': Discrete(${h.min}, ${h.max}, step=${h.step || 0.1}),`);
        } else if (h.type === 'discrete') {
          const values = h.choices.map((c: any) => JSON.stringify(c)).join(', ');
          lines.push(`            '${name}': Categorical([${values}]),`);
        }
      }
      lines.push(`        }`);
      lines.push(``);
    }

    // Populate hyperopt params (legacy) if any
    const populateHyperopt = this.generatePopulateHyperoptParams(template);
    if (populateHyperopt) {
      lines.push(populateHyperopt.split('\n').map(l => `    ${l}`).join('\n'));
      lines.push(``);
    }

    return lines.join('\n');
  }

  private generateParameterLines(params: Record<string, any>): string {
    const lines: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      const comment = this.getParameterComment(key);
      if (comment) {
        lines.push(`    # ${comment}`);
      }
      lines.push(`    ${key} = ${this.toPythonValue(value)}`);
    }
    return lines.join('\n        ');
  }

  private getParameterComment(key: string): string {
    const comments: Record<string, string> = {
      stoploss: 'Stop loss (negative percentage)',
      trailing_stop: 'Enable trailing stop',
      trailing_stop_positive: 'Trailing stop positive offset',
      trailing_stop_positive_offset: 'Trailing stop positive offset',
      rsi_period: 'RSI calculation period',
      ema_fast: 'Fast EMA period',
      ema_slow: 'Slow EMA period',
      macd_fast: 'MACD fast EMA period',
      macd_slow: 'MACD slow EMA period',
      macd_signal: 'MACD signal period',
      bbands_period: 'Bollinger Bands period',
      bbands_std: 'Bollinger Bands standard deviation',
      atr_period: 'ATR period',
      roi_step: 'ROI step size',
    };
    return comments[key] || '';
  }

  private generateIndicatorLines(indicators: IndicatorConfig[]): string {
    const lines: string[] = [];
    for (const indicator of indicators) {
      const params = this.formatIndicatorParams(indicator);
      const output = indicator.output;

      switch (indicator.function.toUpperCase()) {
        case 'RSI':
          lines.push(`        dataframe['${output}'] = ta.RSI(dataframe, timeperiod=${params.timeperiod})`);
          break;
        case 'EMA':
          lines.push(`        dataframe['${output}'] = ta.EMA(dataframe, timeperiod=${params.timeperiod})`);
          break;
        case 'SMA':
          lines.push(`        dataframe['${output}'] = ta.SMA(dataframe, timeperiod=${params.timeperiod})`);
          break;
        case 'MACD':
          lines.push(`        macd = ta.MACD(dataframe, fastperiod=${params.fastperiod}, slowperiod=${params.slowperiod}, signalperiod=${params.signalperiod})`);
          lines.push(`        dataframe['${output}'] = macd['macd']`);
          break;
        case 'ATR':
          lines.push(`        dataframe['${output}'] = ta.ATR(dataframe, timeperiod=${params.timeperiod})`);
          break;
        case 'BBANDS':
          lines.push(`        bbands = ta.BBANDS(dataframe, timeperiod=${params.timeperiod}, nbdevup=${params.nbdevup}, nbdevdn=${params.nbdevdn})`);
          lines.push(`        dataframe['${output}_lower'] = bbands['lowerband']`);
          lines.push(`        dataframe['${output}_upper'] = bbands['upperband']`);
          break;
        case 'VWAP':
          lines.push(`        dataframe['${output}'] = (dataframe['volume'] * (dataframe['high'] + dataframe['low'] + dataframe['close']) / 3).cumsum() / dataframe['volume'].cumsum()`);
          break;
        case 'OBV':
          lines.push(`        dataframe['${output}'] = ta.OBV(dataframe)`);
          break;
        case 'STOCH':
          lines.push(`        stoch = ta.STOCH(dataframe, fastk_period=${params.timeperiod}, slowk_period=${params.slowk_period || 3}, slowd_period=${params.slowd_period || 3}, slowk_matype=0, slowd_matype=0)`);
          lines.push(`        dataframe['${output}_k'] = stoch['slowk']`);
          lines.push(`        dataframe['${output}_d'] = stoch['slowd']`);
          break;
        case 'ADX':
          lines.push(`        dataframe['${output}'] = ta.ADX(dataframe, timeperiod=${params.timeperiod})`);
          break;
        case 'CCI':
          lines.push(`        dataframe['${output}'] = ta.CCI(dataframe, timeperiod=${params.timeperiod})`);
          break;
        default:
          this.logger.warn(`Unknown indicator: ${indicator.function}, skipping`);
      }
    }
    return lines.join('\n');
  }

  /**
   * 生成条件表达式 (支持 Condition 数组或 ConditionNode 树)
   */
  private generateConditionLines(conditions: (Condition | ConditionNode)[], type: 'entry' | 'exit'): string {
    if (conditions.length === 0) {
      return `        dataframe.loc[:, '${type}_long'] = 0`;
    }

    // 将数组转换为统一的条件树
    const rootNode: ConditionNode = conditions.length === 1 && (conditions[0] as ConditionNode).type === 'group'
      ? (conditions[0] as ConditionNode)
      : {
          type: 'group',
          logic: 'AND',
          children: conditions.map(cond => 
            (cond as ConditionNode).type === 'condition' || !(cond as ConditionNode).type
              ? { type: 'condition', condition: cond as Condition }
              : cond as ConditionNode
          )
        };

    const conditionStr = this.generateConditionTree(rootNode);
    const action = type === 'entry' ? 'enter_long' : 'exit_long';
    return `        dataframe.loc[${conditionStr}, '${action}'] = 1`;
  }

  /**
   * 递归生成条件树表达式
   */
  private generateConditionTree(node: ConditionNode): string {
    if (node.type === 'condition' && node.condition) {
      const cond = node.condition;
      const left = `dataframe['${cond.left}']`;
      const right = cond.rightIsColumn ? `dataframe['${cond.right}']` : cond.right;
      return `${left} ${cond.operator} ${right}`;
    }

    if (node.type === 'group' && node.children) {
      const operator = node.logic || 'AND';
      const childExprs = node.children.map(child => this.generateConditionTree(child));
      // Add parentheses around each child except when it's already a single condition
      const wrapped = childExprs.map(expr => {
        // If expression already contains spaces (likely a binary op), wrap in parens
        return `(${expr})`;
      });
      return wrapped.join(` ${operator} `);
    }

    return 'True'; // Fallback
  }

  private calculateStartupCandles(indicators: IndicatorConfig[]): number {
    // Find max period among all indicators
    let maxPeriod = 50; // Default
    for (const indicator of indicators) {
      const period = indicator.params.timeperiod || indicator.params.fastperiod || 0;
      if (period > maxPeriod) {
        maxPeriod = period;
      }
    }
    return maxPeriod + 10; // Extra buffer
  }

  private formatIndicatorParams(indicator: IndicatorConfig): Record<string, number> {
    const defaults: Record<string, number> = {
      timeperiod: 14,
      fastperiod: 12,
      slowperiod: 26,
      signalperiod: 9,
      nbdevup: 2,
      nbdevdn: 2,
    };
    return { ...defaults, ...indicator.params };
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/[- ]+/g, '_')
      .replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)
      .replace(/^_/, '');
  }

  private toPythonValue(value: any): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    return JSON.stringify(value);
  }

  /**
   * 生成 Hyperopt 参数空间定义 (可选)
   */
  private generateHyperoptSpace(template: StrategyTemplate): string | null {
    const paramEntries = Object.entries(template.parameters).filter(([_, def]) => {
      return def && typeof def === 'object' && 'hyperopt' in (def as any);
    });

    if (paramEntries.length === 0) {
      return null;
    }

    const lines: string[] = [];
    lines.push(`    @staticmethod`);
    lines.push(`    def hyperopt_params():`);
    lines.push(`        return {`);

    for (const [name, def] of paramEntries) {
      const h = (def as any).hyperopt;
      const defaultVal = (def as any).default !== undefined ? this.toPythonValue((def as any).default) : 'None';
      switch (h.type) {
        case 'int':
          lines.push(`            '${name}': {'type': 'integer', 'min': ${h.min}, 'max': ${h.max}, 'step': ${h.step || 1}, 'default': ${defaultVal}},`);
          break;
        case 'float':
          lines.push(`            '${name}': {'type': 'float', 'min': ${h.min}, 'max': ${h.max}, 'step': ${h.step || 0.1}, 'default': ${defaultVal}},`);
          break;
        case 'discrete':
          const choices = h.choices.map((c: any) => this.toPythonValue(c)).join(', ');
          lines.push(`            '${name}': {'type': 'discrete', 'values': [${choices}], 'default': ${defaultVal}},`);
          break;
      }
    }

    lines.push(`        }`);
    return lines.join('\n');
  }

  /**
   * 生成 populate_hyperopt_params 方法 (旧版 hyperopt 接口)
   */
  private generatePopulateHyperoptParams(template: StrategyTemplate): string | null {
    const paramEntries = Object.entries(template.parameters).filter(([_, def]) => {
      return def && typeof def === 'object' && 'hyperopt' in (def as any);
    });

    if (paramEntries.length === 0) {
      return null;
    }

    const lines: string[] = [];
    lines.push(`    @staticmethod`);
    lines.push(`    def populate_hyperopt_params():`);
    lines.push(`        return {`);
    for (const [name, def] of paramEntries) {
      const defaultVal = (def as any).default !== undefined ? this.toPythonValue((def as any).default) : 'None';
      lines.push(`            '${name}': ${defaultVal},`);
    }
    lines.push(`        }`);
    return lines.join('\n');
  }

  private generateImports(template: StrategyTemplate): string[] {
    const imports = [
      'from datetime import datetime',
      'from typing import Dict, Tuple, List, Optional',
      'import pandas as pd',
      'import talib.abstract as ta',
      'import freqtrade.vendor.qtpylib.indicators as qtpylib',
      'from freqtrade.strategy import IStrategy, informative',
      'from freqtrade.strategy.interface import SellType',
      'from pandas import DataFrame',
    ];
    // Add hyperopt import if needed
    const hasHyperopt = Object.values(template.parameters).some(def => 
      def && typeof def === 'object' && 'hyperopt' in (def as any)
    );
    if (hasHyperopt) {
      imports.push('from freqtrade.optimize.space import Integer, Discrete, Categorical');
    }
    return imports;
  }
}

// Singleton
let compiler: StrategyCompiler | null = null;

export function getStrategyCompiler(): StrategyCompiler {
  if (!compiler) {
    compiler = new StrategyCompiler();
  }
  return compiler;
}

// Convenience function
export function compileStrategy(template: StrategyTemplate): CompiledStrategy {
  return getStrategyCompiler().compile(template);
}
