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
  entryConditions: Condition[];
  exitConditions: Condition[];
  parameters: Record<string, any>;
  GeminiTags?: string[]; // For hyperopt grouping
  version?: string;
  author?: string;
}

export interface Condition {
  left: string; // Column name or indicator output
  operator: '<' | '<=' | '>' | '>=' | '==' | '!=';
  right: number | string;
  rightIsColumn?: boolean;
  logic?: 'AND' | 'OR'; // Default AND
}

export class StrategyCompiler {
  private logger: winston.Logger;

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
    const paramLines = this.generateParameterLines(template.parameters);
    const indicatorLines = this.generateIndicatorLines(template.indicators);
    const entryLines = this.generateConditionLines(template.entryConditions, 'entry');
    const exitLines = this.generateConditionLines(template.exitConditions, 'exit');

    return `#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auto-generated strategy by OpenClaw Quant Skills.

Strategy: ${template.name}
${template.description ? `Description: ${template.description}` : ''}
Timeframe: ${template.timeframe}
${template.author ? `Author: ${template.author}` : ''}${template.version ? `
Version: ${template.version}` : ''}
"""

from datetime import datetime
from typing import Dict, Tuple
import pandas as pd
import talib.abstract as ta
import freqtrade.vendor.qtpylib.indicators as qtpylib
from freqtrade.strategy import IStrategy, informative
from freqtrade.strategy.interface import SellType
from pandas import DataFrame


class ${className}(IStrategy):
    """
    ${template.description || 'Auto-generated strategy'}
    """

    # Strategy configuration
    INTERFACE_VERSION = 3

    # Timeframe
    timeframe = "${template.timeframe}"

    # Startup candle count (ensure indicators have enough data)
    startup_candle_count: int = ${this.calculateStartupCandles(template.indicators)}

    # Parameter space for hyperopt
    ${paramLines}

    # ROI table (simplified - can be overridden)
    minimal_roi = {
        "60": 0.01,
        "30": 0.02,
        "0": 0.04
    }

    # Stop loss
    stoploss = ${template.parameters.stoploss ?? -0.1}

    # Trailing stop
    trailing_stop = ${template.parameters.trailing_stop ? 'True' : 'False'}
    ${template.parameters.trailing_stop ? `
    trailing_stop_positive = ${template.parameters.trailing_stop_positive ?? 0.02}
    trailing_stop_positive_offset = ${template.parameters.trailing_stop_positive_offset ?? 0.04}
    ` : ''}

    # Process only new candles
    process_only_new_candles = True

    # Order types
    order_types = {
        "entry": "limit",
        "exit": "limit",
        "stoploss": "market",
        "stoploss_on_exchange": True,
    }

    def populate_indicators(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:
        """
        Add technical indicators to the dataframe.
        """
        ${indicatorLines}

        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:
        """
        Based on TA indicators, populates the entry signal for the given dataframe
        """
        ${entryLines}

        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:
        """
        Based on TA indicators, populates the exit signal for the given dataframe
        """
        ${exitLines}

        return dataframe

    def informative_pairs(self) -> List[Tuple[str, str, str]]:
        """
        Define additional informative pairs for strategy
        """
        return []

    # Optional: Custom stoploss calculation
    # def custom_stoploss(self, pair: str, trade: 'Trade', current_time: datetime, current_rate: float, proposed_stoploss: float, **kwargs) -> float:
    #     return proposed_stoploss

    # Optional: Custom sell signal
    # def custom_sell(self, pair: str, trade: 'Trade', current_time: datetime, current_rate: float, current_profit: float, **kwargs) -> Optional[Tuple[str, str]]:
    #     return None
`;
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
      const inputCol = indicator.input;
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
          lines.push(`        dataframe['${output}'] = bbands['middleband']`);
          break;
        default:
          this.logger.warn(`Unknown indicator: ${indicator.function}, skipping`);
      }
    }
    return lines.join('\n');
  }

  private generateConditionLines(conditions: Condition[], type: 'entry' | 'exit'): string {
    if (conditions.length === 0) {
      return `        dataframe.loc[:, '${type}_long'] = 0`;
    }

    // Build condition string
    const conditionStr = conditions.map((cond, idx) => {
      const left = `dataframe['${cond.left}']`;
      const right = cond.rightIsColumn ? `dataframe['${cond.right}']` : cond.right;
      const op = cond.operator;
      const condition = `${left} ${op} ${right}`;
      return condition;
    }).join(` ${conditions[0].logic || 'AND'} `);

    // Freqtrade uses dataframe.loc with boolean mask
    const action = type === 'entry' ? 'enter_long' : 'exit_long';
    return `        dataframe.loc[${conditionStr}, '${action}'] = 1`;
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

  private generateImports(template: StrategyTemplate): string[] {
    const imports = [
      'from datetime import datetime',
      'from typing import Dict, Tuple',
      'import pandas as pd',
      'import talib.abstract as ta',
      'import freqtrade.vendor.qtpylib.indicators as qtpylib',
      'from freqtrade.strategy import IStrategy, informative',
      'from freqtrade.strategy.interface import SellType',
      'from pandas import DataFrame',
    ];
    // Add custom imports if needed
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
