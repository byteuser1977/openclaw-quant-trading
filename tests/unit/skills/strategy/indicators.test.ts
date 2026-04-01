import { getIndicatorEngine, IndicatorConfig } from '@/skills/strategy/indicators';
import { OHLCV } from '@/skills/data';

describe('IndicatorEngine (New API)', () => {
  let engine: ReturnType<typeof getIndicatorEngine>;

  beforeAll(() => {
    engine = getIndicatorEngine();
  });

  function createMockData(length: number): OHLCV[] {
    return Array.from({ length }, (_, i) => ({
      timestamp: Date.now() - (length - i) * 60 * 1000,
      open: 100 + i * 0.1,
      high: 101 + i * 0.1,
      low: 99 + i * 0.1,
      close: 100.5 + i * 0.1,
      volume: 1000,
    }));
  }

  describe('RSI', () => {
    it('should calculate RSI correctly', () => {
      const data = createMockData(50);
      const result = engine.syncCalculate(
        {
          name: 'rsi',
          function: 'RSI',
          params: { timeperiod: 14 },
          input: 'close',
          output: 'rsi',
        },
        data
      );
      expect(result.values.length).toBe(50);
      // First 14 values should be NaN
      expect(result.values.slice(0, 14).every(v => isNaN(v as number))).toBe(true);
      // After that, should be numbers between 0-100
      const validValues = result.values.slice(14).filter(v => !isNaN(v as number));
      expect(validValues.length).toBeGreaterThan(0);
      validValues.forEach(v => {
        expect(v as number).toBeGreaterThanOrEqual(0);
        expect(v as number).toBeLessThanOrEqual(100);
      });
    });

    it('should return NaN for insufficient data', () => {
      const shortData = createMockData(5);
      const result = engine.syncCalculate(
        {
          name: 'rsi',
          function: 'RSI',
          params: { timeperiod: 14 },
          input: 'close',
          output: 'rsi',
        },
        shortData
      );
      expect(result.values.every(v => isNaN(v as number))).toBe(true);
    });
  });

  describe('EMA', () => {
    it('should calculate EMA', () => {
      const data = createMockData(30);
      const closeArray = data.map(d => d.close);
      const result = engine.syncCalculate(
        {
          name: 'ema',
          function: 'EMA',
          params: { timeperiod: 10 },
          input: 'close',
          output: 'ema',
        },
        data
      );
      expect(result.values.length).toBe(30);
      // First 9 values are NaN
      expect(result.values.slice(0, 9).every(v => isNaN(v as number))).toBe(true);
      // After that, values should be numbers
      expect(typeof result.values[9]).toBe('number');
    });
  });

  describe('MACD', () => {
    it('should calculate MACD components', () => {
      const data = createMockData(50);
      const result = engine.syncCalculate(
        {
          name: 'macd',
          function: 'MACD',
          params: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
          input: 'close',
          output: 'macd_line',
        },
        data
      );
      expect(result.values.length).toBe(50);
      // MACD line valid values start after slow EMA becomes valid (index 25)
      // With 50 points and slow period 26, expect about 25 valid values
      const validCount = result.values.filter(v => !isNaN(v as number)).length;
      expect(validCount).toBeGreaterThanOrEqual(20); // At least 20 valid values
      expect(validCount).toBeLessThan(50); // Not all values are valid (NaNs at start)
    });
  });

  describe('Multiple indicators', () => {
    it('should calculate multiple indicators efficiently', () => {
      const data = createMockData(50);
      const configs: IndicatorConfig[] = [
        {
          name: 'ema_fast',
          function: 'EMA',
          params: { timeperiod: 12 },
          input: 'close',
          output: 'ema_fast',
        },
        {
          name: 'ema_slow',
          function: 'EMA',
          params: { timeperiod: 26 },
          input: 'close',
          output: 'ema_slow',
        },
        {
          name: 'rsi',
          function: 'RSI',
          params: { timeperiod: 14 },
          input: 'close',
          output: 'rsi',
        },
      ];
      const results = engine.syncCalculateMultiple(configs, data);
      expect(results.size).toBe(3);
      expect(results.has('ema_fast')).toBe(true);
      expect(results.has('ema_slow')).toBe(true);
      expect(results.has('rsi')).toBe(true);
    });
  });
});
