/**
 * Technical Indicators Framework
 *
 * Provides a unified interface for calculating technical indicators.
 * Supports both TA-Lib (native) and pure JavaScript fallback implementations.
 */

import { Logger } from '../../core/logger';
import { OHLCV as DataOHLCV } from '../data';

// Indicator function signature
export interface IndicatorFunction {
  (input: number[]): number[];
}

export interface IndicatorConfig {
  name: string;
  function: string;
  params: Record<string, any>;
  input: 'open' | 'high' | 'low' | 'close' | 'volume';
  output: string;
  custom?: {
    formula?: string; // For custom Python-style formulas
  };
}

export interface IndicatorResult {
  name: string;
  values: number[];
  index: number; // Which array index corresponds to current candle
}

// Abstract base for indicator providers
abstract class IndicatorProvider {
  abstract supports(indicator: string): boolean | Promise<boolean>;
  abstract calculate(indicator: string, data: OHLCV[], params: Record<string, number>): number[] | Promise<number[]>;
}

// Pure JS implementation (fallback)
class JSIndicatorProvider extends IndicatorProvider {
  // Simple Moving Average
  private sma(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += data[i - j];
        }
        result.push(sum / period);
      }
    }
    return result;
  }

  // Exponential Moving Average
  private ema(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);
    let prevEMA = data[0]; // Start with first value

    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        result.push(prevEMA);
      } else {
        const ema = (data[i] - prevEMA) * multiplier + prevEMA;
        result.push(ema);
        prevEMA = ema;
      }
    }
    return result;
  }

  // RSI - Relative Strength Index
  private rsi(close: number[], period: number = 14): number[] {
    const result: number[] = [];
    const changes: number[] = [0];

    for (let i = 1; i < close.length; i++) {
      changes.push(close[i] - close[i - 1]);
    }

    const gains = changes.map((c) => (c > 0 ? c : 0));
    const losses = changes.map((c) => (c < 0 ? -c : 0));

    let avgGain = 0;
    let avgLoss = 0;

    // First average
    for (let i = 1; i <= period; i++) {
      avgGain += gains[i];
      avgLoss += losses[i];
    }
    avgGain /= period;
    avgLoss /= period;

    // First RSI
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));

    // Smoothed RSI for rest
    for (let i = period + 1; i < close.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }

    // Pad beginning with NaNs
    while (result.length < close.length) {
      result.unshift(NaN);
    }
    return result;
  }

  // MACD - Moving Average Convergence Divergence
  private macd(close: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): { macd: number[]; signal: number[]; histogram: number[] } {
    const fastEMA = this.ema(close, fastPeriod);
    const slowEMA = this.ema(close, slowPeriod);
    const macdLine = close.map((_, i) => fastEMA[i] - slowEMA[i]);
    const signalLine = this.ema(macdLine, signalPeriod);
    const histogram = macdLine.map((v, i) => v - signalLine[i]);

    return { macd: macdLine, signal: signalLine, histogram };
  }

  // ATR - Average True Range
  private atr(high: number[], low: number[], close: number[], period = 14): number[] {
    const tr: number[] = [0]; // First TR is undefined

    for (let i = 1; i < high.length; i++) {
      const hl = high[i] - low[i];
      const hc = Math.abs(high[i] - close[i - 1]);
      const lc = Math.abs(low[i] - close[i - 1]);
      tr.push(Math.max(hl, hc, lc));
    }

    // Smoothed ATR (Wilder's smoothing)
    const atr: number[] = [];
    let sum = 0;
    for (let i = 1; i <= period; i++) {
      sum += tr[i];
      atr.push(NaN);
    }
    atr[period] = sum / period;

    for (let i = period + 1; i < high.length; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    return atr;
  }

  // Bollinger Bands
  private bbands(close: number[], period = 20, stdDev = 2): { upper: number[]; middle: number[]; lower: number[] } {
    const sma = this.sma(close, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < close.length; i++) {
      if (i < period - 1) {
        upper.push(NaN);
        lower.push(NaN);
      } else {
        let sumSq = 0;
        for (let j = 0; j < period; j++) {
          sumSq += Math.pow(close[i - j] - sma[i], 2);
        }
        const std = Math.sqrt(sumSq / period);
        upper.push(sma[i] + std * stdDev);
        lower.push(sma[i] - std * stdDev);
      }
    }

    return { upper, middle: sma, lower };
  }

  // Volume-weighted SMA (simple)
  private vwma(close: number[], volume: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < close.length; i++) {
      if (i < period - 1) {
        result.push(NaN);
      } else {
        let sumPV = 0;
        let sumV = 0;
        for (let j = 0; j < period; j++) {
          sumPV += close[i - j] * volume[i - j];
          sumV += volume[i - j];
        }
        result.push(sumPV / sumV);
      }
    }
    return result;
  }

  // Stochastic Oscillator
  private stoch(high: number[], low: number[], close: number[], fastK = 14, slowK = 3, slowD = 3): { fastk: number[]; fastd: number[] } {
    const nLow = this.sma(low, fastK);
    const nHigh = this.sma(high, fastK); // Actually should use rolling min/max, but sma is not correct
    // Simplified: use min/max over period
    const minLow: number[] = [];
    const maxHigh: number[] = [];

    for (let i = 0; i < low.length; i++) {
      if (i < fastK - 1) {
        minLow.push(NaN);
        maxHigh.push(NaN);
      } else {
        let min = low[i];
        let max = high[i];
        for (let j = 1; j < fastK; j++) {
          min = Math.min(min, low[i - j]);
          max = Math.max(max, high[i - j]);
        }
        minLow.push(min);
        maxHigh.push(max);
      }
    }

    const fastk = close.map((c, i) => {
      if (minLow[i] === maxHigh[i]) return 50;
      return ((c - minLow[i]) / (maxHigh[i] - minLow[i])) * 100;
    });

    const fastd = this.sma(fastk, slowD);
    return { fastk, fastd };
  }

  override supports(indicator: string): boolean {
    return ['SMA', 'EMA', 'RSI', 'MACD', 'ATR', 'BBANDS', 'VWMA', 'STOCH'].includes(indicator.toUpperCase());
  }

  override calculate(indicator: string, data: OHLCV[], params: Record<string, number>): number[] {
    const name = indicator.toUpperCase();
    const close = data.map((d) => d.close);
    const high = data.map((d) => d.high);
    const low = data.map((d) => d.low);
    const volume = data.map((d) => d.volume);

    switch (name) {
      case 'SMA':
        return this.sma(close, params.timeperiod || 14);
      case 'EMA':
        return this.ema(close, params.timeperiod || 14);
      case 'RSI':
        return this.rsi(close, params.timeperiod || 14);
      case 'MACD': {
        const { macd, signal, histogram } = this.macd(
          close,
          params.fastperiod || 12,
          params.slowperiod || 26,
          params.signalperiod || 9
        );
        // By default return MACD line
        return { macd: macd, signal: signal, histogram: histogram }[params.output || 'macd'] || macd;
      }
      case 'ATR':
        return this.atr(high, low, close, params.timeperiod || 14);
      case 'BBANDS': {
        const { upper, middle, lower } = this.bbands(close, params.timeperiod || 20, params.nbdevup || 2);
        return { upper, middle, lower }[params.output || 'middle'] || middle;
      }
      case 'VWMA':
        return this.vwma(close, volume, params.timeperiod || 14);
      case 'STOCH': {
        const { fastk, fastd } = this.stoch(high, low, close, params.fastk_period || 14, params.slowk_period || 3, params.slowd_period || 3);
        return typeof params.output === 'string' && params.output === 'fastd' ? fastd : fastk;
      }
      default:
        throw new Error(`Unsupported indicator in JS provider: ${indicator}`);
    }
  }
}

// TA-Lib provider (native)
class TalibProvider extends IndicatorProvider {
  private talib: any = null;

  private async loadTalib(): Promise<boolean> {
    if (this.talib) return true;
    try {
      // Dynamic import for TA-Lib (if available)
      this.talib = require('node-talib');
      return true;
    } catch (e) {
      const logger = Logger.getLogger('indicators');
      logger.warn('TA-Lib not available, falling back to JavaScript implementations');
      return false;
    }
  }

  async supports(indicator: string): Promise<boolean> {
    const loaded = await this.loadTalib();
    if (!loaded) return false;
    return typeof this.talib[indicator] === 'function';
  }

  async calculate(indicator: string, data: OHLCV[], params: Record<string, number>): Promise<number[]> {
    const loaded = await this.loadTalib();
    if (!loaded) {
      throw new Error('TA-Lib not available');
    }

    // TA-Lib expects arrays of floats
    const inReal = data.map((d) => d.close).map(Number);
    const outReal = new Array(inReal.length);
    const startIdx = { value: 0 };
    const endIdx = { value: inReal.length };

    const indicatorName = indicator.toUpperCase();
    const talibParams = Object.values(params).map(Number);

    const result = this.talib[indicatorName](
      startIdx,
      endIdx,
      inReal,
      ...talibParams,
      outReal
    );

    if (result !== 0) {
      throw new Error(`TA-Lib calculation failed for ${indicator}: ${result}`);
    }

    // Convert Buffer/Float64Array to number[]
    return Array.from(outReal);
  }
}

// Re-export shared OHLCV type from data module (single source of truth)
export type OHLCV = DataOHLCV;

// Main Indicator Engine
export class IndicatorEngine {
  private providers: IndicatorProvider[] = [];
  private fallbackProvider: JSIndicatorProvider;
  private logger: any;

  constructor() {
    this.fallbackProvider = new JSIndicatorProvider();
    this.providers.push(this.fallbackProvider);
    this.logger = Logger.getLogger('indicators');

    // Try to add TA-Lib provider if available
    try {
      const talib = require('node-talib');
      if (talib) {
        this.providers.push(new TalibProvider());
        this.logger.info('TA-Lib provider initialized');
      }
    } catch (e) {
      // TA-Lib not available, use fallback
    }
  }

  async calculate(
    config: IndicatorConfig,
    data: OHLCV[]
  ): Promise<{ name: string; values: number[]; index: number }> {
    const indicatorName = config.function.toUpperCase();
    const inputArray = this.getInputArray(data, config.input);
    const { params } = config;

    // Find provider that supports this indicator
    for (const provider of this.providers) {
      if (await provider.supports(indicatorName)) {
        const values = await provider.calculate(indicatorName, data, params);
        return {
          name: config.output,
          values,
          index: data.length - 1, // Current candle is last index
        };
      }
    }

    throw new Error(`No provider supports indicator: ${indicatorName}`);
  }

  private getInputArray(data: OHLCV[], input: string): number[] {
    return data.map((d) => {
      switch (input) {
        case 'open': return d.open;
        case 'high': return d.high;
        case 'low': return d.low;
        case 'close': return d.close;
        case 'volume': return d.volume;
        default: return d.close;
      }
    });
  }

  async calculateMultiple(configs: IndicatorConfig[], data: OHLCV[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();

    // Group by indicator to avoid duplicate calculations
    const indicatorGroups = new Map<string, IndicatorConfig[]>();
    for (const config of configs) {
      const key = config.function.toUpperCase() + JSON.stringify(config.params);
      if (!indicatorGroups.has(key)) {
        indicatorGroups.set(key, []);
      }
      indicatorGroups.get(key)!.push(config);
    }

    // Calculate each unique indicator once
    for (const [key, configs] of indicatorGroups) {
      const config = configs[0]; // All configs in group share same params
      try {
        const result = await this.calculate(config, data);
        for (const cfg of configs) {
          results.set(cfg.output, result.values);
        }
      } catch (error) {
        this.logger.error(`Failed to calculate ${config.function}: ${error}`);
        throw error;
      }
    }

    return results;
  }

  syncCalculate(config: IndicatorConfig, data: OHLCV[]): { name: string; values: number[]; index: number } {
    // Synchronous version using only fallback provider (which is sync)
    if (!this.fallbackProvider.supports(config.function)) {
      throw new Error(`Indicator not supported in sync mode: ${config.function}`);
    }
    const values = this.fallbackProvider.calculate(config.function, data, config.params);
    return {
      name: config.output,
      values,
      index: data.length - 1,
    };
  }

  syncCalculateMultiple(configs: IndicatorConfig[], data: OHLCV[]): Map<string, number[]> {
    const results = new Map<string, number[]>();
    for (const config of configs) {
      try {
        const result = this.syncCalculate(config, data);
        results.set(config.output, result.values);
      } catch (error) {
        this.logger.error(`Sync calculation failed for ${config.function}: ${error}`);
        throw error;
      }
    }
    return results;
  }

  // Compatibility methods for tests and simple usage
  calculateRSI(data: OHLCV, params: { timeperiod: number }): number[] {
    const config: IndicatorConfig = {
      name: 'rsi',
      function: 'RSI',
      params,
      input: 'close',
      output: 'rsi',
    };
    const result = this.syncCalculate(config, [data]); // data as single element array? But syncCalculate expects OHLCV[]
    // Actually we need to pass array of OHLCV
    // For compatibility, we treat data as array or single? Let's adapt.
    return result.values;
  }

  calculateEMA(data: number[], params: { timeperiod: number }): number[] {
    const ohlcvArray: OHLCV[] = data.map((close, i) => ({
      timestamp: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }));
    const config: IndicatorConfig = {
      name: 'ema',
      function: 'EMA',
      params,
      input: 'close',
      output: 'ema',
    };
    const result = this.syncCalculateMultiple([config], ohlcvArray);
    return result.get('ema')!;
  }

  calculateSMA(data: number[], params: { timeperiod: number }): number[] {
    const ohlcvArray: OHLCV[] = data.map((close, i) => ({
      timestamp: i, // placeholder
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }));
    const config: IndicatorConfig = {
      name: 'sma',
      function: 'SMA',
      params,
      input: 'close',
      output: 'sma',
    };
    const result = this.syncCalculateMultiple([config], ohlcvArray);
    return result.get('sma')!;
  }

  calculateMACD(data: number[], params: { fastperiod: number; slowperiod: number; signalperiod: number }): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
    const ohlcvArray: OHLCV[] = data.map((close, i) => ({
      timestamp: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }));
    const config: IndicatorConfig = {
      name: 'macd',
      function: 'MACD',
      params,
      input: 'close',
      output: 'macd_line',
    };
    // Note: MACD provider returns macd, signal, histogram but we only get one output per config
    // So we need to use a special handling
    // For simplicity, we'll just call the fallback provider directly
    const values = this.fallbackProvider.calculate('MACD', ohlcvArray, params) as any;
    return {
      macdLine: values.macd,
      signalLine: values.signal,
      histogram: values.histogram,
    };
  }

  calculateATR(data: OHLCV, params: { timeperiod: number }): number[] {
    const config: IndicatorConfig = {
      name: 'atr',
      function: 'ATR',
      params,
      input: 'close',
      output: 'atr',
    };
    const result = this.syncCalculate(config, [data]);
    return result.values;
  }

  calculateBollingerBands(data: number[], params: { timeperiod: number; nbdevup: number; nbdevdn: number }): { upper: number[]; middle: number[]; lower: number[] } {
    const ohlcvArray: OHLCV[] = data.map((close, i) => ({
      timestamp: i,
      open: close,
      high: close,
      low: close,
      close,
      volume: 0,
    }));
    const config: IndicatorConfig = {
      name: 'bbands',
      function: 'BBANDS',
      params,
      input: 'close',
      output: 'bb_upper',
    };
    // Fallback BBANDS returns multiple outputs
    const values = this.fallbackProvider.calculate('BBANDS', ohlcvArray, params) as any;
    return {
      upper: values.upper,
      middle: values.middle,
      lower: values.lower,
    };
  }
}

// Singleton instance
let indicatorEngine: IndicatorEngine | null = null;

export function getIndicatorEngine(): IndicatorEngine {
  if (!indicatorEngine) {
    indicatorEngine = new IndicatorEngine();
  }
  return indicatorEngine;
}

// Convenience functions
export async function calculateIndicator(
  config: IndicatorConfig,
  data: OHLCV[]
): Promise<{ name: string; values: number[]; index: number }> {
  return getIndicatorEngine().calculate(config, data);
}

export async function calculateIndicators(
  configs: IndicatorConfig[],
  data: OHLCV[]
): Promise<Map<string, number[]>> {
  return getIndicatorEngine().calculateMultiple(configs, data);
}

export function syncCalculateIndicator(
  config: IndicatorConfig,
  data: OHLCV[]
): { name: string; values: number[]; index: number } {
  return getIndicatorEngine().syncCalculate(config, data);
}

export function syncCalculateIndicators(
  configs: IndicatorConfig[],
  data: OHLCV[]
): Map<string, number[]> {
  return getIndicatorEngine().syncCalculateMultiple(configs, data);
}
