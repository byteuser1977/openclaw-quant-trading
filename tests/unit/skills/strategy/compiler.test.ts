/**
 * Unit tests for Strategy Compiler
 */

import { StrategyCompiler, compileStrategy, getStrategyCompiler, StrategyTemplate, Condition, ConditionNode } from '@/skills/strategy/compiler';
import { IndicatorConfig } from '@/skills/strategy/indicators';
import { ParameterSpaceBuilder } from '@/skills/strategy/parameters';

describe('Strategy Compiler', () => {
  let compiler: StrategyCompiler;

  beforeEach(() => {
    compiler = getStrategyCompiler();
  });

  describe('compile', () => {
    it('should compile a simple MA cross strategy', () => {
      const template: StrategyTemplate = {
        name: 'Simple MA Cross',
        description: 'Test strategy',
        timeframe: '5m',
        indicators: [
          {
            name: 'fast_ma',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ema_fast',
          },
          {
            name: 'slow_ma',
            function: 'EMA',
            params: { timeperiod: 21 },
            input: 'close',
            output: 'ema_slow',
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

      const result = compiler.compile(template);

      expect(result.code).toBeDefined();
      expect(result.className).toBe('SimpleMACross');
      expect(result.fileName).toBe('simple_ma_cross.py');
      expect(result.indicators).toEqual(template.indicators);
      expect(result.parameters).toEqual(template.parameters);
      expect(result.imports).toContain('from freqtrade.strategy import IStrategy');
      expect(result.code).toContain('class SimpleMACross(IStrategy):');
      expect(result.code).toContain('def populate_indicators(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:');
      expect(result.code).toContain('def populate_entry_trend(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:');
      expect(result.code).toContain('def populate_exit_trend(self, dataframe: DataFrame, metadata: Dict) -> DataFrame:');
    });

    it('should generate correct TA-Lib indicator calls', () => {
      const template: StrategyTemplate = {
        name: 'RSI Strategy',
        timeframe: '1h',
        indicators: [
          {
            name: 'rsi',
            function: 'RSI',
            params: { timeperiod: 14 },
            input: 'close',
            output: 'rsi',
          },
          {
            name: 'macd',
            function: 'MACD',
            params: { fastperiod: 12, slowperiod: 26, signalperiod: 9 },
            input: 'close',
            output: 'macd_line',
          },
          {
            name: 'bbands',
            function: 'BBANDS',
            params: { timeperiod: 20, nbdevup: 2, nbdevdn: 2 },
            input: 'close',
            output: 'bb_upper',
          },
        ],
        entryConditions: [
          { left: 'rsi', operator: '<', right: 30 },
        ],
        exitConditions: [
          { left: 'rsi', operator: '>', right: 70 },
        ],
        parameters: {},
      };

      const result = compiler.compile(template);

      expect(result.code).toContain("dataframe['rsi'] = ta.RSI(dataframe, timeperiod=14)");
      expect(result.code).toContain("macd = ta.MACD(dataframe, fastperiod=12, slowperiod=26, signalperiod=9)");
      expect(result.code).toContain("bbands = ta.BBANDS(dataframe, timeperiod=20, nbdevup=2, nbdevdn=2)");
    });

    it('should generate correct entry/exit conditions', () => {
      const template: StrategyTemplate = {
        name: 'Condition Test',
        timeframe: '15m',
        indicators: [
          {
            name: 'indicator1',
            function: 'EMA',
            params: { timeperiod: 10 },
            input: 'close',
            output: 'ind1',
          },
        ],
        entryConditions: [
          { left: 'ind1', operator: '>', right: 100, logic: 'AND' },
          { left: 'ind1', operator: '<', right: 200, logic: 'OR' },
        ],
        exitConditions: [
          { left: 'ind1', operator: '==', right: 150 },
        ],
        parameters: {},
      };

      const result = compiler.compile(template);

      expect(result.code).toContain("dataframe.loc[dataframe['ind1'] > 100 AND dataframe['ind1'] < 200, 'enter_long'] = 1");
      expect(result.code).toContain("dataframe.loc[dataframe['ind1'] == 150, 'exit_long'] = 1");
    });

    it('should include stoploss and trailing stop parameters', () => {
      const template: StrategyTemplate = {
        name: 'Stoploss Test',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {
          stoploss: -0.15,
          trailing_stop: true,
          trailing_stop_positive: 0.03,
          trailing_stop_positive_offset: 0.05,
        },
      };

      const result = compiler.compile(template);

      expect(result.code).toContain('stoploss = -0.15');
      expect(result.code).toContain('trailing_stop = True');
      expect(result.code).toContain('trailing_stop_positive = 0.03');
      expect(result.code).toContain('trailing_stop_positive_offset = 0.05');
    });

    it('should calculate startup_candle_count based on indicators', () => {
      const template: StrategyTemplate = {
        name: 'Startup Test',
        timeframe: '1h',
        indicators: [
          { name: 'ema', function: 'EMA', params: { timeperiod: 50 }, input: 'close', output: 'ema' },
          { name: 'sma', function: 'SMA', params: { timeperiod: 200 }, input: 'close', output: 'sma' },
          { name: 'rsi', function: 'RSI', params: { timeperiod: 14 }, input: 'close', output: 'rsi' },
        ],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = compiler.compile(template);

      // Max period is 200, so startup should be at least 210
      expect(result.code).toContain('startup_candle_count = 210');
    });

    it('should use custom className if provided', () => {
      const template: StrategyTemplate = {
        name: 'Test Strategy',
        className: 'MyCustomStrategy',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = compiler.compile(template);

      expect(result.className).toBe('MyCustomStrategy');
      expect(result.fileName).toBe('my_custom_strategy.py');
      expect(result.code).toContain('class MyCustomStrategy(IStrategy):');
    });

    it('should generate valid Python code syntax', async () => {
      const template: StrategyTemplate = {
        name: 'Syntax Test',
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
          { left: 'ema', operator: '>', right: 100 },
        ],
        exitConditions: [
          { left: 'ema', operator: '<', right: 50 },
        ],
        parameters: {
          stoploss: -0.1,
          trailing_stop: true,
          trailing_stop_positive: 0.02,
          trailing_stop_positive_offset: 0.04,
        },
      };

      const result = compiler.compile(template);

      // Try to compile Python code (basic check)
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        // Write temp file and compile
        const fs = require('fs');
        const path = require('path');
        const tmpdir = require('os').tmpdir();
        const tempFile = path.join(tmpdir, `test_strategy_${Date.now()}.py`);
        fs.writeFileSync(tempFile, result.code);

        try {
          await execAsync('python -m py_compile ' + tempFile);
          // If we get here, syntax is valid
          expect(true).toBe(true);
        } finally {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
          }
        }
      } catch (error: any) {
        if (error.stderr && error.stderr.includes('SyntaxError')) {
          fail(`Generated Python code has syntax errors: ${error.stderr}`);
        } else {
          // Ignore other exec errors (python not found, etc.)
          console.warn('Python syntax check skipped (python not available)');
        }
      }
    });
  });

  describe('toPascalCase', () => {
    // Access private method via testing
    it('should convert snake_case to PascalCase', () => {
      const compilerInstance = getStrategyCompiler();
      // Use reflection or just test via observed behavior
      const result = compilerInstance.compile({
        name: 'macd_strategy_v2',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      });
      expect(result.className).toBe('MacdStrategyV2');
    });

    it('should convert kebab-case to PascalCase', () => {
      const compilerInstance = getStrategyCompiler();
      const result = compilerInstance.compile({
        name: 'rsi-macd-hybrid',
        timeframe: '1h',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      });
      expect(result.className).toBe('RsiMacdHybrid');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert PascalCase to snake_case', () => {
      const compilerInstance = getStrategyCompiler();
      const result = compilerInstance.compile({
        name: 'TestStrategyName',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      });
      expect(result.fileName).toBe('test_strategy_name.py');
    });
  });

  describe('Condition tree generation', () => {
    it('should handle flat condition list without logic', () => {
      const template: StrategyTemplate = {
        name: 'Flat Conds',
        timeframe: '5m',
        indicators: [
          { name: 'ema', function: 'EMA', params: { timeperiod: 10 }, input: 'close', output: 'ema' },
        ],
        entryConditions: [
          { left: 'ema', operator: '>', right: 100 },
          { left: 'ema', operator: '<', right: 200 },
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = compiler.compile(template);
      expect(result.code).toContain("dataframe['ema'] > 100 AND dataframe['ema'] < 200");
    });

    it('should handle nested condition groups', () => {
      const template: StrategyTemplate = {
        name: 'Nested Conds',
        timeframe: '5m',
        indicators: [
          { name: 'ema', function: 'EMA', params: { timeperiod: 10 }, input: 'close', output: 'ema' },
          { name: 'rsi', function: 'RSI', params: { timeperiod: 14 }, input: 'close', output: 'rsi' },
        ],
        entryConditions: [
          {
            type: 'group',
            logic: 'OR',
            children: [
              {
                type: 'condition',
                condition: { left: 'ema', operator: '>', right: 100 },
              },
              {
                type: 'group',
                logic: 'AND',
                children: [
                  {
                    type: 'condition',
                    condition: { left: 'rsi', operator: '<', right: 30 },
                  },
                ],
              },
            ],
          },
        ],
        exitConditions: [],
        parameters: {},
      };

      const result = compiler.compile(template);
      expect(result.code).toContain('(');
      expect(result.code).toContain(')');
    });
  });

  describe('Hyperopt parameter generation', () => {
    it('should include hyperopt parameters if defined', () => {
      const template: StrategyTemplate = {
        name: 'Hyperopt Test',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {
          period: {
            type: 'int',
            default: 14,
            hyperopt: { type: 'int', min: 5, max: 50, step: 1 },
          } as any,
          threshold: {
            type: 'decimal',
            default: 0.1,
            hyperopt: { type: 'float', min: 0.05, max: 0.5, step: 0.01 },
          } as any,
        },
      };

      const result = compiler.compile(template);

      expect(result.code).toContain('@staticmethod');
      expect(result.code).toContain('def hyperopt_parameters():');
      expect(result.code).toContain("'period': Integer(5, 50)");
      expect(result.code).toContain("'threshold': Discrete(0.05, 0.5, step=0.01)");
    });

    it('should not include hyperopt methods if no hyperopt params', () => {
      const template: StrategyTemplate = {
        name: 'No Hyperopt',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {
          stoploss: -0.1,
        },
      };

      const result = compiler.compile(template);

      expect(result.code).not.toContain('@staticmethod');
      expect(result.code).not.toContain('def hyperopt_parameters():');
    });
  });

  describe('Default parameters', () => {
    it('should set default stoploss if not provided', () => {
      const template: StrategyTemplate = {
        name: 'Defaults',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = compiler.compile(template);

      expect(result.code).toContain('stoploss = -0.1');
    });

    it('should include ROI table', () => {
      const template: StrategyTemplate = {
        name: 'ROI Test',
        timeframe: '5m',
        indicators: [],
        entryConditions: [],
        exitConditions: [],
        parameters: {},
      };

      const result = compiler.compile(template);

      expect(result.code).toContain('minimal_roi = {');
      expect(result.code).toContain('"60": 0.01');
      expect(result.code).toContain('"30": 0.02');
      expect(result.code).toContain('"0": 0.04');
    });
  });
});

describe('compileStrategy convenience function', () => {
  it('should compile using the singleton compiler', () => {
    const template: StrategyTemplate = {
      name: 'Test',
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
        { left: 'ema', operator: '>', right: 100 },
      ],
      exitConditions: [],
      parameters: {},
    };

    const result = compileStrategy(template);
    expect(result.code).toBeDefined();
    expect(result.className).toBe('Test');
  });
});
