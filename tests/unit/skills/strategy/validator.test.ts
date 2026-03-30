/**
 * Unit tests for Strategy Validator
 */

import { validateStrategy, ValidationResult } from '@/skills/strategy/validator';
import { StrategyTemplate, Condition } from '@/skills/strategy/compiler';

describe('Strategy Validator', () => {
  describe('validateTemplate', () => {
    it('should validate a correct template', async () => {
      const template: StrategyTemplate = {
        name: 'Valid Strategy',
        description: 'A valid test strategy',
        timeframe: '5m',
        indicators: [
          {
            name: 'ema_fast',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema_fast',
          },
        ],
        entryConditions: [
          { left: 'ema_fast', operator: '>', right: 'ema_slow' },
        ],
        exitConditions: [
          { left: 'ema_fast', operator: '<', right: 'ema_slow' },
        ],
        parameters: {
          stoploss: -0.1,
        },
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject template with missing name', async () => {
      const template: StrategyTemplate = {
        name: '',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_001')).toBe(true);
    });

    it('should reject template with invalid timeframe', async () => {
      const template: StrategyTemplate = {
        name: 'Test',
        timeframe: 'invalid',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_003')).toBe(true);
    });

    it('should reject template with no indicators', async () => {
      const template: StrategyTemplate = {
        name: 'No Indicators',
        timeframe: '5m',
        indicators: [],
        entryConditions: [
          { left: 'close', operator: '>', right: 100 },
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_004')).toBe(true);
    });

    it('should detect missing indicator fields', async () => {
      const template: StrategyTemplate = {
        name: 'Missing Indicator Fields',
        timeframe: '5m',
        indicators: [
          {
            name: 'test',
            // missing function and output
            params: {},
            input: 'close',
          } as any,
        ],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_006')).toBe(true);
      expect(result.errors.some(e => e.code === 'VAL_007')).toBe(true);
    });

    it('should warn about undefined indicator references in conditions', async () => {
      const template: StrategyTemplate = {
        name: 'Undefined Reference',
        timeframe: '5m',
        indicators: [
          {
            name: 'ema',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema',
          },
        ],
        entryConditions: [
          { left: 'undefined_indicator', operator: '>', right: 100 },
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(true); // Only a warning
      expect(result.warnings.some(w => w.code === 'VAL_W02')).toBe(true);
    });

    it('should validate condition operators', async () => {
      const template: StrategyTemplate = {
        name: 'Invalid Operator',
        timeframe: '5m',
        indicators: [
          {
            name: 'ema',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema',
          },
        ],
        entryConditions: [
          { left: 'ema', operator: 'INVALID' as any, right: 100 },
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_011')).toBe(true);
    });

    it('should validate required fields in conditions', async () => {
      const template: StrategyTemplate = {
        name: 'Incomplete Condition',
        timeframe: '5m',
        indicators: [
          {
            name: 'ema',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema',
          },
        ],
        entryConditions: [
          { left: 'ema', operator: '>', right: undefined } as any, // missing right
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_012')).toBe(true);
    });

    it('should warn when multiple conditions without logic operator', async () => {
      const template: StrategyTemplate = {
        name: 'Missing Logic',
        timeframe: '5m',
        indicators: [
          {
            name: 'ema',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema',
          },
        ],
        entryConditions: [
          { left: 'ema', operator: '>', right: 100 }, // No logic - should default to AND
          { left: 'ema', operator: '<', right: 200 }, // No logic
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'VAL_W08')).toBe(true);
    });

    it('should calculate validation metrics correctly', async () => {
      const template: StrategyTemplate = {
        name: 'Metrics Test',
        timeframe: '5m',
        indicators: [
          { name: 'ema1', function: 'EMA', params: { timeperiod: 10 }, input: 'close', output: 'ema1' },
          { name: 'ema2', function: 'EMA', params: { timeperiod: 20 }, input: 'close', output: 'ema2' },
          { name: 'rsi', function: 'RSI', params: { timeperiod: 14 }, input: 'close', output: 'rsi' },
        ],
        entryConditions: [
          { left: 'ema1', operator: '>', right: 'ema2' },
          { left: 'rsi', operator: '<', right: 30 },
        ],
        exitConditions: [
          { left: 'ema1', operator: '<', right: 'ema2' },
        ],
        parameters: {
          stoploss: -0.1,
          trailing_stop: true,
        },
      };

      const result = await validateStrategy(template);

      expect(result.metrics.indicatorsCount).toBe(3);
      expect(result.metrics.entryConditions).toBe(2);
      expect(result.metrics.exitConditions).toBe(1);
      expect(result.metrics.parametersCount).toBe(2);
      expect(result.metrics.complexityScore).toBeGreaterThan(0);
      expect(result.metrics.complexityScore).toBeLessThanOrEqual(100);
    });

    it('should accept standard OHLC column names in conditions', async () => {
      const template: StrategyTemplate = {
        name: 'OHLC Test',
        timeframe: '5m',
        indicators: [
          {
            name: 'test',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema',
          },
        ],
        entryConditions: [
          { left: 'close', operator: '>', right: 'open' },
        ],
        exitConditions: [
          { left: 'high', operator: '>', right: 100 },
          { left: 'low', operator: '<', right: 50 },
        ],
        parameters: {},
      };

      const result = await validateStrategy(template);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('validatePythonCode', async () => {
    it('should validate correct Python code', async () => {
      const pythonCode = `
from freqtrade.strategy import IStrategy
import pandas as pd

class TestStrategy(IStrategy):
    timeframe = "5m"
    startup_candle_count = 50

    def populate_indicators(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        dataframe['ema'] = ta.EMA(dataframe, timeperiod=10)
        return dataframe

    def populate_entry_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        dataframe.loc[dataframe['ema'] > 100, 'enter_long'] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: pd.DataFrame, metadata: dict) -> pd.DataFrame:
        dataframe.loc[dataframe['ema'] < 50, 'exit_long'] = 1
        return dataframe
`;

      const result = await validateStrategy({ name: 'Test', timeframe: '5m', indicators: [], entryConditions: [], exitConditions: [], parameters: {} }, pythonCode);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required methods', async () => {
      const pythonCode = `
from freqtrade.strategy import IStrategy

class IncompleteStrategy(IStrategy):
    def populate_indicators(self, dataframe, metadata):
        return dataframe
`;

      const result = await validateStrategy({ name: 'Test', timeframe: '5m', indicators: [], entryConditions: [], exitConditions: [], parameters: {} }, pythonCode);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'VAL_008')).toBe(true);
    });

    it('should warn about missing IStrategy inheritance', async () => {
      const pythonCode = `
class NotIStrategy:
    timeframe = "5m"
    def populate_indicators(self, df, md):
        return df
    def populate_entry_trend(self, df, md):
        return df
    def populate_exit_trend(self, df, md):
        return df
`;

      const result = await validateStrategy({ name: 'Test', timeframe: '5m', indicators: [], entryConditions: [], exitConditions: [], parameters: {} }, pythonCode);

      expect(result.valid).toBe(true); // Not an error, just warning
      expect(result.warnings.some(w => w.code === 'VAL_W04')).toBe(true);
    });

    it('should detect Python syntax errors', async () => {
      const pythonCode = `
class SyntaxErrorStrategy(IStrategy):
    def populate_indicators(self, dataframe, metadata):
        return dataframe  # missing colon or other syntax issue will be caught by py_compile
    def populate_entry_trend(self, dataframe, metadata):
        dataframe.loc['enter_long'] = 1  # Invalid syntax
        return dataframe
    def populate_exit_trend(self, dataframe, metadata):
        return dataframe
`;

      const result = await validateStrategy({ name: 'Test', timeframe: '5m', indicators: [], entryConditions: [], exitConditions: [], parameters: {} }, pythonCode);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'PY_SYNTAX')).toBe(true);
    });

    it('should warn about TODO/FIXME comments', async () => {
      const pythonCode = `
class TodoStrategy(IStrategy):
    # TODO: Implement proper logic
    def populate_indicators(self, df, md):
        # FIXME: This is a placeholder
        return df
    def populate_entry_trend(self, df, md):
        return df
    def populate_exit_trend(self, df, md):
        return df
`;

      const result = await validateStrategy({ name: 'Test', timeframe: '5m', indicators: [], entryConditions: [], exitConditions: [], parameters: {} }, pythonCode);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'VAL_W06')).toBe(true);
    });
  });

  describe('validate combined (template + python)', () => {
    it('should fail if either template or code invalid', async () => {
      const badTemplate: StrategyTemplate = {
        name: '',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const badCode = `
class BadStrategy(IStrategy):
    def populate_indicators(self, df, md):
        return df
    def populate_entry_trend(self, df, md):
        return df
    def populate_exit_trend(self, df, md):
        return df
`;

      const result = await validateStrategy(badTemplate, badCode);

      expect(result.valid).toBe(false);
      // Should have errors from both template (missing name) and code (missing methods inheritance check)
      expect(result.errors.length >= 1).toBe(true);
    });
  });
});
