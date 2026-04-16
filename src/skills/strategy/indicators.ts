/**
 * Technical Indicators Framework
 * 封装 TA-Lib + 提供 JS 软回退
 */

import { getLogger } from '../../core/logger';

const logger = getLogger('indicators');

// TA-Lib 软链接检测标志
let talibAvailable = false;
let talibModule: any = null;

/**
 * 初始化 TA-Lib（尝试加载，失败则使用软回退）
 */
export async function initIndicators(): Promise<void> {
  try {
    // @ts-ignore - TA-Lib 类型定义可能缺失
    talibModule = await import('talib');
    talibAvailable = true;
    logger.info('TA-Lib loaded successfully', { mode: 'native' });
  } catch (error) {
    logger.warn('TA-Lib not available, falling back to JS implementations', { error: String(error) });
    talibAvailable = false;
  }
}

/**
 * 检查 TA-Lib 是否可用
 */
export function isTalibAvailable(): boolean {
  return talibAvailable;
}

/**
 * 指标输入数据结构
 * 所有字段可选，但 close 必填（大多数指标需要）
 */
export interface IndicatorInput {
  open?: number[];
  high?: number[];
  low?: number[];
  close: number[];
  volume?: number[];
}

/**
 * 指标结果接口
 */
export interface IndicatorResult {
  name: string;
  values: number[];
  params?: Record<string, any>;
}

// =====================================================
// Helper Functions
// =====================================================

/**
 * 确保输入数据长度足够
 */
function ensureLength(input: number[], required: number, indicatorName: string): number[] {
  if (input.length < required) {
    logger.warn(`${indicatorName}: input length ${input.length} < required ${required}, padding with NaN`);
    return [...input, ...Array(required - input.length).fill(NaN)];
  }
  return input;
}

/**
 * SMA (Simple Moving Average)
 */
export function SMA(close: number[], period: number = 14): number[] {
  const result: number[] = [];
  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      const sum = close.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * EMA (Exponential Moving Average)
 */
export function EMA(close: number[], period: number = 14): number[] {
  const multiplier = 2 / (period + 1);
  const result: number[] = [];

  // First value is SMA
  const sma = SMA(close, period);
  let prevEMA = sma[period - 1];

  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else if (i === period - 1) {
      result.push(prevEMA);
    } else {
      const ema = (close[i] - prevEMA) * multiplier + prevEMA;
      result.push(ema);
      prevEMA = ema;
    }
  }

  return result;
}

/**
 * WMA (Weighted Moving Average)
 */
export function WMA(close: number[], period: number = 14): number[] {
  const result: number[] = [];
  const weightSum = (period * (period + 1)) / 2;

  for (let i = 0; i < close.length; i++) {
    if (i < period - 1) {
      result.push(NaN);
    } else {
      let weightedSum = 0;
      for (let j = 0; j < period; j++) {
        weightedSum += close[i - period + 1 + j] * (j + 1);
      }
      result.push(weightedSum / weightSum);
    }
  }

  return result;
}

/**
 * RSI (Relative Strength Index)
 *
 * @example
 * const rsi = RSI(close, 14);
 */
export function RSI(close: number[], period: number = 14): number[] {
  if (close.length === 0) return [];

  const changes: number[] = [];
  for (let i = 1; i < close.length; i++) {
    changes.push(close[i] - close[i - 1]);
  }

  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);

  const avgGain = SMA(gains, period);
  const avgLoss = SMA(losses, period);

  const result: number[] = [NaN]; // first element has no change

  for (let i = 0; i < avgGain.length; i++) {
    if (avgLoss[i] === 0) {
      result.push(100);
    } else {
      const rs = avgGain[i] / avgLoss[i];
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

/**
 * MACD (Moving Average Convergence Divergence)
 *
 * @returns { macd: number[], signal: number[], histogram: number[] }
 */
export function MACD(
  close: number[],
  fastperiod: number = 12,
  slowperiod: number = 26,
  signperiod: number = 9
): { macd: number[]; signal: number[]; histogram: number[] } {
  const emaFast = EMA(close, fastperiod);
  const emaSlow = EMA(close, slowperiod);

  const macdLine: number[] = [];
  for (let i = 0; i < close.length; i++) {
    if (emaFast[i] !== emaFast[i] || emaSlow[i] !== emaSlow[i]) { // NaN check
      macdLine.push(NaN);
    } else {
      macdLine.push(emaFast[i] - emaSlow[i]);
    }
  }

  const signalLine = EMA(macdLine, signperiod);

  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== macdLine[i] || signalLine[i] !== signalLine[i]) {
      histogram.push(NaN);
    } else {
      histogram.push(macdLine[i] - signalLine[i]);
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

/**
 * ATR (Average True Range)
 */
export function ATR(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  if (high.length === 0) return [];

  // First bar's TR is simply high-low (no previous close to compare)
  const trueRanges: number[] = [high[0] - low[0]];

  for (let i = 1; i < high.length; i++) {
    const tr = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
    trueRanges.push(tr);
  }

  return SMA(trueRanges, period);
}

/**
 * Bollinger Bands
 *
 * @returns { upper: number[], middle: number[], lower: number[] }
 */
export function BollingerBands(
  close: number[],
  period: number = 20,
  stdDev: number = 2
): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = SMA(close, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (middle[i] !== middle[i]) { // NaN check
      upper.push(NaN);
      lower.push(NaN);
    } else {
      const slice = close.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const std = Math.sqrt(variance);

      upper.push(mean + stdDev * std);
      lower.push(mean - stdDev * std);
    }
  }

  return { upper, middle, lower };
}

/**
 * Stochastic Oscillator
 *
 * @returns { slowk: number[], slowd: number[] }
 */
export function Stochastic(
  high: number[],
  low: number[],
  close: number[],
  fastkPeriod: number = 14,
  slowkPeriod: number = 3,
  slowdPeriod: number = 3
): { slowk: number[]; slowd: number[] } {
  const fastk: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < fastkPeriod - 1) {
      fastk.push(NaN);
    } else {
      const recentHigh = Math.max(...high.slice(i - fastkPeriod + 1, i + 1));
      const recentLow = Math.min(...low.slice(i - fastkPeriod + 1, i + 1));
      const range = recentHigh - recentLow;
      if (range === 0) {
        fastk.push(50);
      } else {
        fastk.push(100 * (close[i] - recentLow) / range);
      }
    }
  }

  const slowk = SMA(fastk, slowkPeriod);
  const slowd = SMA(slowk, slowdPeriod);

  return { slowk, slowd };
}

/**
 * ADX (Average Directional Index)
 *
 * Simplified implementation - for production use TA-Lib
 */
export function ADX(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  // Placeholder: 纯 JS 实现较复杂，这里返回 NaNs
  // 建议使用 TA-Lib 生产版本
  logger.warn('ADX JS implementation is simplified, use TA-Lib for production');

  return new Array(close.length).fill(NaN);
}

/**
 * OBV (On-Balance Volume)
 */
export function OBV(close: number[], volume: number[]): number[] {
  const result: number[] = [0];

  for (let i = 1; i < close.length; i++) {
    if (close[i] > close[i - 1]) {
      result.push(result[i - 1] + volume[i]);
    } else if (close[i] < close[i - 1]) {
      result.push(result[i - 1] - volume[i]);
    } else {
      result.push(result[i - 1]);
    }
  }

  return result;
}

/**
 * CCI (Commodity Channel Index)
 */
export function CCI(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): number[] {
  const typicalPrices: number[] = high.map((h, i) => (h + low[i] + close[i]) / 3);
  const sma = SMA(typicalPrices, period);

  const result: number[] = [];

  for (let i = 0; i < typicalPrices.length; i++) {
    if (sma[i] !== sma[i]) { // NaN check
      result.push(NaN);
    } else {
      let meanDev = 0;
      for (let j = 0; j < period; j++) {
        meanDev += Math.abs(typicalPrices[i - j] - sma[i]);
      }
      meanDev /= period;
      const cci = (typicalPrices[i] - sma[i]) / (0.015 * meanDev);
      result.push(isFinite(cci) ? cci : NaN);
    }
  }

  return result;
}

/**
 * ROC (Rate of Change)
 */
export function ROC(close: number[], period: number = 10): number[] {
  const result: number[] = [];

  for (let i = 0; i < close.length; i++) {
    if (i < period) {
      result.push(NaN);
    } else {
      const roc = ((close[i] - close[i - period]) / close[i - period]) * 100;
      result.push(roc);
    }
  }

  return result;
}

// =====================================================
// TA-Lib Wrapper
// =====================================================

/**
 * Normalize input to full IndicatorInput by filling missing arrays with zeros
 */
function normalizeInput(inputs: IndicatorInput): Required<IndicatorInput> {
  const len = inputs.close.length;
  return {
    open: inputs.open ?? new Array(len).fill(0),
    high: inputs.high ?? new Array(len).fill(0),
    low: inputs.low ?? new Array(len).fill(0),
    close: inputs.close,
    volume: inputs.volume ?? new Array(len).fill(0)
  };
}

/**
 * 调用 TA-Lib 原生函数
 */
async function callTalib(
  name: string,
  inputs: IndicatorInput,
  params: number[]
): Promise<number[]> {
  if (!talibAvailable || !talibModule) {
    throw new Error('TA-Lib not available');
  }

  // Normalize inputs to ensure all arrays present
  const fullInputs = normalizeInput(inputs);

  // @ts-ignore - TA-Lib 类型可能缺失
  const { read } = talibModule;
  const indicator = read.lookup(name);
  if (!indicator) {
    throw new Error(`TA-Lib indicator '${name}' not found`);
  }

  const start = Buffer.alloc(4);
  const output = Buffer.alloc(100000 * 8); // allocate large buffer

  const result = indicator({
    startIdx: 0,
    endIdx: fullInputs.close.length - 1,
    outputSize: output.length,
    input: [
      { buffer: Buffer.from(fullInputs.open) },
      { buffer: Buffer.from(fullInputs.high) },
      { buffer: Buffer.from(fullInputs.low) },
      { buffer: Buffer.from(fullInputs.close) },
      ...(fullInputs.volume && fullInputs.volume.length > 0 ? [{ buffer: Buffer.from(fullInputs.volume) }] : [])
    ],
    output: [
      { buffer: output, offset: start }
    ],
    optIn: params
  });

  if (result !== 0) {
    throw new Error(`TA-Lib error: ${result}`);
  }

  // Parse output
  const outBeg = start.readInt32LE(0);
  const outNb = output.readInt32LE(0);
  const values: number[] = [];
  for (let i = 0; i < outNb; i++) {
    values.push(output.readDoubleLE(8 * (i + 1)));
  }

  // Pad with NaNs to match input length
  const padded = [...Array(outBeg).fill(NaN), ...values];
  return padded;
}

// =====================================================
// High-Level Indicator Wrappers
// =====================================================

/**
 * 智能 RSI - 自动选择 TA-Lib 或 JS 实现
 */
export async function calculateRSI(
  close: number[],
  period: number = 14
): Promise<number[]> {
  if (talibAvailable) {
    try {
      const result = await callTalib('RSI', { close }, [period]);
      return result;
    } catch (error) {
      logger.warn('TA-Lib RSI failed, falling back to JS', { error: String(error) });
    }
  }
  return RSI(close, period);
}

/**
 * 智能 MACD
 */
export async function calculateMACD(
  close: number[],
  fastperiod: number = 12,
  slowperiod: number = 26,
  signalperiod: number = 9
): Promise<{ macd: number[]; signal: number[]; histogram: number[] }> {
  if (talibAvailable) {
    try {
      const result = await callTalib('MACD', { close }, [fastperiod, slowperiod, signalperiod]);
      // TA-Lib returns interleaved array; would need parsing.
      // For now fallback to JS to avoid complexity.
    } catch (error) {
      logger.warn('TA-Lib MACD failed, falling back');
    }
  }
  return MACD(close, fastperiod, slowperiod, signalperiod);
}

/**
 * 智能 ATR
 */
export async function calculateATR(
  high: number[],
  low: number[],
  close: number[],
  period: number = 14
): Promise<number[]> {
  if (talibAvailable) {
    try {
      const result = await callTalib('ATR', { high, low, close }, [period]);
      return result;
    } catch (error) {
      logger.warn('TA-Lib ATR failed, falling back');
    }
  }
  return ATR(high, low, close, period);
}

// =====================================================
// Exports
// =====================================================

export const indicators = {
  SMA,
  EMA,
  WMA,
  RSI,
  MACD,
  ATR,
  BollingerBands,
  Stochastic,
  ADX,
  OBV,
  CCI,
  ROC,
  // Smart wrappers
  calculateRSI,
  calculateMACD,
  calculateATR,
  // Init
  initIndicators,
  isTalibAvailable
};

export default indicators;
