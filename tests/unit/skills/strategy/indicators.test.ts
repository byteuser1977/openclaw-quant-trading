import {
  SMA,
  EMA,
  WMA,
  RSI,
  MACD,
  ATR,
  BollingerBands,
  Stochastic,
  OBV,
  CCI,
  ROC,
  indicators,
  initIndicators,
  isTalibAvailable
} from '../../../../src/skills/strategy/indicators';

// 测试用 OHLCV 数据
const sampleClose = [100, 102, 101, 105, 107, 106, 108, 110, 109, 112, 115, 117, 116, 118, 120];
const sampleHigh = [101, 103, 102, 106, 108, 107, 109, 111, 110, 113, 116, 118, 117, 119, 121];
const sampleLow = [99, 101, 100, 104, 106, 105, 107, 109, 108, 111, 114, 116, 115, 117, 119];
const sampleVolume = [1000, 1100, 900, 1200, 1300, 1250, 1400, 1350, 1100, 1500, 1600, 1550, 1450, 1700, 1800];

describe('SMA', () => {
  it('should calculate simple moving average', () => {
    const data = [1, 2, 3, 4, 5];
    const sma3 = SMA(data, 3);
    expect(sma3).toEqual([NaN, NaN, 2, 3, 4]);
  });

  it('should handle period larger than data length', () => {
    const data = [1, 2, 3];
    const sma5 = SMA(data, 5);
    expect(sma5.every(v => isNaN(v))).toBe(true);
  });

  it('should work with realistic data', () => {
    const sma5 = SMA(sampleClose, 5);
    expect(sma5.length).toBe(sampleClose.length);
    expect(sma5[4]).toBeCloseTo(103, 1); // (100+102+101+105+107)/5 = 103
  });

  it('should return NaN for initial positions', () => {
    const sma5 = SMA(sampleClose, 5);
    for (let i = 0; i < 4; i++) {
      expect(isNaN(sma5[i])).toBe(true);
    }
  });
});

describe('EMA', () => {
  it('should calculate exponential moving average', () => {
    const data = [1, 2, 3, 4, 5];
    const ema3 = EMA(data, 3);
    expect(ema3.length).toBe(data.length);
    expect(isNaN(ema3[0])).toBe(true);
    expect(isNaN(ema3[1])).toBe(true);
    expect(isNaN(ema3[2])).toBe(false);
  });

  it('should be greater than SMA for uptrend', () => {
    // 上升趋势 EMA 对最近价格更敏感
    const uptrend = [10, 12, 14, 16, 18, 20, 22];
    const ema3 = EMA(uptrend, 3);
    const sma3 = SMA(uptrend, 3);
    // EMA 应该比 SMA 更接近最新价格（在上升趋势中更高）
    expect(ema3[uptrend.length - 1]).toBeGreaterThanOrEqual(sma3[uptrend.length - 1]);
  });
});

describe('WMA', () => {
  it('should calculate weighted moving average', () => {
    const data = [10, 20, 30, 40, 50];
    const wma3 = WMA(data, 3);
    // weights: 1,2,3 sum=6
    // last 3: 30,40,50 -> (30*1 + 40*2 + 50*3)/6 = (30+80+150)/6 = 260/6 = 43.33
    expect(wma3[4]).toBeCloseTo(43.33, 1);
  });
});

describe('RSI', () => {
  it('should calculate RSI values between 0 and 100', () => {
    const rsi = RSI(sampleClose, 14);
    rsi.forEach(v => {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });

  it('should return mostly NaN for short data', () => {
    const rsi = RSI([1, 2, 3, 4, 5], 14);
    expect(rsi.every(v => isNaN(v))).toBe(true);
  });

  it('should handle large dataset', () => {
    const bigData = Array(1000).fill(0).map((_, i) => 100 + Math.sin(i * 0.1) * 10);
    const rsi = RSI(bigData, 14);
    expect(rsi.length).toBe(bigData.length);
    const validCount = rsi.filter(v => !isNaN(v)).length;
    // First 14 values are NaN (period), so valid count = length - 14
    expect(validCount).toBe(bigData.length - 14);
  });
});

describe('MACD', () => {
  it('should return three arrays of correct length', () => {
    const { macd, signal, histogram } = MACD(sampleClose, 12, 26, 9);
    expect(macd.length).toBe(sampleClose.length);
    expect(signal.length).toBe(sampleClose.length);
    expect(histogram.length).toBe(sampleClose.length);
  });

  it('should compute histogram as difference of macd and signal', () => {
    const { macd, signal, histogram } = MACD(sampleClose, 12, 26, 9);
    for (let i = 0; i < sampleClose.length; i++) {
      if (!isNaN(macd[i]) && !isNaN(signal[i])) {
        expect(histogram[i]).toBeCloseTo(macd[i] - signal[i], 5);
      }
    }
  });

  it('should have NaN initial values', () => {
    // Use longer dataset to properly test NaN warm-up period
    const longData = Array(100).fill(0).map((_, i) => 100 + i);
    const { macd } = MACD(longData, 12, 26, 9);
    // slow EMA period is 26, so at least 25 NaNs
    const nanCount = macd.filter(v => isNaN(v)).length;
    expect(nanCount).toBeGreaterThanOrEqual(25);
  });
});

describe('ATR', () => {
  it('should calculate average true range', () => {
    const atr = ATR(sampleHigh, sampleLow, sampleClose, 14);
    expect(atr.length).toBe(sampleHigh.length);
    // Should be positive values or NaN
    atr.forEach(v => {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('should handle simple case', () => {
    const h = [10, 11, 12];
    const l = [9, 10, 11];
    const c = [9.5, 10.5, 11.5];
    const atr = ATR(h, l, c, 2);
    expect(atr.length).toBe(3);
    expect(isNaN(atr[0])).toBe(true);
    expect(isNaN(atr[1])).toBe(false);
  });
});

describe('BollingerBands', () => {
  it('should return upper, middle, lower bands', () => {
    const { upper, middle, lower } = BollingerBands(sampleClose, 20, 2);
    expect(upper.length).toBe(sampleClose.length);
    expect(middle.length).toBe(sampleClose.length);
    expect(lower.length).toBe(sampleClose.length);
  });

  it('should have upper > middle > lower for non-NaN values', () => {
    const { upper, middle, lower } = BollingerBands(sampleClose, 5, 2);
    for (let i = 0; i < sampleClose.length; i++) {
      if (!isNaN(upper[i]) && !isNaN(middle[i]) && !isNaN(lower[i])) {
        expect(upper[i]).toBeGreaterThan(middle[i]);
        expect(middle[i]).toBeGreaterThan(lower[i]);
      }
    }
  });

  it('should have equal middle and SMA', () => {
    const sma20 = SMA(sampleClose, 20);
    const { middle } = BollingerBands(sampleClose, 20, 2);
    for (let i = 0; i < sampleClose.length; i++) {
      if (!isNaN(middle[i])) {
        expect(middle[i]).toBeCloseTo(sma20[i], 5);
      }
    }
  });
});

describe('Stochastic', () => {
  it('should return slowk and slowd arrays', () => {
    const { slowk, slowd } = Stochastic(sampleHigh, sampleLow, sampleClose, 14, 3, 3);
    expect(slowk.length).toBe(sampleHigh.length);
    expect(slowd.length).toBe(sampleHigh.length);
  });

  it('should have values between 0 and 100 (after warmup)', () => {
    const { slowk } = Stochastic(sampleHigh, sampleLow, sampleClose);
    slowk.forEach(v => {
      if (!isNaN(v)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    });
  });
});

describe('OBV', () => {
  it('should calculate on-balance volume', () => {
    const obv = OBV(sampleClose, sampleVolume);
    expect(obv.length).toBe(sampleClose.length);
    expect(obv[0]).toBe(0); // starts at 0
  });

  it('should increase on up days', () => {
    const close = [100, 101, 102]; // uptrend
    const volume = [1000, 1100, 1200];
    const obv = OBV(close, volume);
    expect(obv[1]).toBeGreaterThan(obv[0]);
    expect(obv[2]).toBeGreaterThan(obv[1]);
  });

  it('should decrease on down days', () => {
    const close = [100, 99, 98]; // downtrend
    const volume = [1000, 1100, 1200];
    const obv = OBV(close, volume);
    expect(obv[1]).toBeLessThan(obv[0]);
    expect(obv[2]).toBeLessThan(obv[1]);
  });
});

describe('CCI', () => {
  it('should calculate commodity channel index', () => {
    const cci = CCI(sampleHigh, sampleLow, sampleClose, 14);
    expect(cci.length).toBe(sampleHigh.length);
    // Values can be any real number, typically between -100 and +100 for ranging markets
  });
});

describe('ROC', () => {
  it('should calculate rate of change percentage', () => {
    const close = [100, 110, 120, 130, 140];
    const roc = ROC(close, 1);
    expect(roc[0]).toBe(NaN);
    expect(roc[1]).toBeCloseTo(10, 1); // (110-100)/100*100 = 10%
    expect(roc[2]).toBeCloseTo(9.09, 1); // (120-110)/110*100 ≈ 9.09%
  });

  it('should use correct period', () => {
    const close = [100, 105, 110, 115, 120];
    const roc3 = ROC(close, 3);
    expect(roc3[0]).toBe(NaN);
    expect(roc3[1]).toBe(NaN);
    expect(roc3[2]).toBe(NaN);
    expect(roc3[3]).toBeCloseTo(15, 1); // (115-100)/100*100
    expect(roc3[4]).toBeCloseTo(14.29, 1); // (120-105)/105*100
  });
});

describe('indicators module', () => {
  beforeAll(async () => {
    await initIndicators();
  });

  it('should have isTalibAvailable status', () => {
    const status = isTalibAvailable();
    expect(typeof status).toBe('boolean');
  });

  it('should export all indicator functions', () => {
    expect(typeof indicators.SMA).toBe('function');
    expect(typeof indicators.EMA).toBe('function');
    expect(typeof indicators.RSI).toBe('function');
    expect(typeof indicators.MACD).toBe('function');
    expect(typeof indicators.ATR).toBe('function');
    expect(typeof indicators.BollingerBands).toBe('function');
  });

  it('should have calculateRSI async wrapper', async () => {
    const result = await indicators.calculateRSI(sampleClose, 14);
    expect(result.length).toBe(sampleClose.length);
  });
});

describe('Edge cases', () => {
  it('should handle single element array', () => {
    expect(RSI([100])).toEqual([NaN]);
    expect(SMA([100], 5)).toEqual([NaN]);
  });

  it('should handle empty array', () => {
    expect(RSI([])).toEqual([]);
    expect(SMA([], 10)).toEqual([]);
    expect(ATR([], [], [], 14)).toEqual([]);
  });

  it('should handle period 1', () => {
    const data = [1, 2, 3, 4];
    const sma1 = SMA(data, 1);
    expect(sma1).toEqual(data); // SMA with period 1 = the same
  });
});
