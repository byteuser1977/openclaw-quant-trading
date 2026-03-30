/**
 * Unit tests for Strategy Builder API
 */

import {
  StrategyBuilder,
  getParameterFromSpace,
  mergeTemplates,
  ParameterSpace,
  IntParameter,
  DecimalParameter,
  CompiledStrategy,
} from '@/skills/strategy';
import { StrategyTemplate, Condition, ConditionNode } from '@/skills/strategy/compiler';

describe('StrategyBuilder', () => {
  describe('constructor', () => {
    it('should create a new builder with name', () => {
      const builder = new StrategyBuilder('TestStrategy', 'Test description');
      expect(builder).toBeInstanceOf(StrategyBuilder);
    });

    it('should set default values', () => {
      const builder = new StrategyBuilder('Test');
      expect(builder['template'].timeframe).toBe('5m');
      expect(builder['template'].indicators).toEqual([]);
      expect(builder['template'].entryConditions).toEqual([]);
      expect(builder['template'].exitConditions).toEqual([]);
    });
  });

  describe('fluent API', () => {
    it('should support chaining all methods', () => {
      const builder = new StrategyBuilder('Test')
        .setTimeframe('1h')
        .addIndicator({
          name: 'ema',
          function: 'EMA',
          params: { timeperiod: 10 },
          input: 'close',
          output: 'ema',
        })
        .addEntryCondition({ left: 'ema', operator: '>', right: 100 })
        .addExitCondition({ left: 'ema', operator: '<', right: 50 })
        .addParameter('stoploss', -0.1)
        .setParameters({ trailing_stop: true, trailing_stop_positive: 0.02 });

      expect(builder['template'].timeframe).toBe('1h');
      expect(builder['template'].indicators).toHaveLength(1);
      expect(builder['template'].entryConditions).toHaveLength(1);
      expect(builder['template'].exitConditions).toHaveLength(1);
      expect(builder['template'].parameters.stoploss).toBe(-0.1);
      expect(builder['template'].parameters.trailing_stop).toBe(true);
    });
  });

  describe('setTimeframe', () => {
    it('should set timeframe', () => {
      const builder = new StrategyBuilder('Test');
      builder.setTimeframe('1h');
      expect(builder['template'].timeframe).toBe('1h');
    });
  });

  describe('addIndicator', () => {
    it('should add indicator config', () => {
      const builder = new StrategyBuilder('Test');
      builder.addIndicator({
        name: 'rsi',
        function: 'RSI',
        params: { timeperiod: 14 },
        input: 'close',
        output: 'rsi',
      });
      expect(builder['template'].indicators).toHaveLength(1);
      expect(builder['template'].indicators[0].name).toBe('rsi');
    });

    it('should allow multiple indicators', () => {
      const builder = new StrategyBuilder('Test')
        .addIndicator({
          name: 'ema_fast',
          function: 'EMA',
          params: { timeperiod: 10 },
          input: 'close',
          output: 'ema_fast',
        })
        .addIndicator({
          name: 'ema_slow',
          function: 'EMA',
          params: { timeperiod: 21 },
          input: 'close',
          output: 'ema_slow',
        });

      expect(builder['template'].indicators).toHaveLength(2);
    });
  });

  describe('addEntryCondition / addExitCondition', () => {
    it('should add entry conditions', () => {
      const builder = new StrategyBuilder('Test');
      builder.addEntryCondition({ left: 'ema', operator: '>', right: 100 });
      builder.addEntryCondition({ left: 'rsi', operator: '<', right: 30, logic: 'AND' });
      expect(builder['template'].entryConditions).toHaveLength(2);
    });

    it('should add exit conditions', () => {
      const builder = new StrategyBuilder('Test');
      builder.addExitCondition({ left: 'ema', operator: '<', right: 50 });
      expect(builder['template'].exitConditions).toHaveLength(1);
    });

    it('should preserve condition structure', () => {
      const condition = {
        left: 'ema',
        operator: '>=' as const,
        right: 100,
        logic: 'OR' as const,
      };
      const builder = new StrategyBuilder('Test');
      builder.addEntryCondition(condition);
      expect(builder['template'].entryConditions[0]).toEqual(condition);
    });
  });

  describe('addParameter / setParameters', () => {
    it('should add single parameter', () => {
      const builder = new StrategyBuilder('Test');
      builder.addParameter('stoploss', -0.1);
      expect(builder['template'].parameters.stoploss).toBe(-0.1);
    });

    it('should set multiple parameters at once', () => {
      const builder = new StrategyBuilder('Test');
      builder.setParameters({
        stoploss: -0.15,
        trailing_stop: true,
        roi_step: 0.02,
      });
      expect(builder['template'].parameters.stoploss).toBe(-0.15);
      expect(builder['template'].parameters.trailing_stop).toBe(true);
      expect(builder['template'].parameters.roi_step).toBe(0.02);
    });

    it('should merge parameters', () => {
      const builder = new StrategyBuilder('Test');
      builder.addParameter('a', 1);
      builder.setParameters({ b: 2 });
      expect(builder['template'].parameters).toEqual({ a: 1, b: 2 });
    });
  });

  describe('setTrailingStop', () => {
    it('should set trailing stop parameters', () => {
      const builder = new StrategyBuilder('Test');
      builder.setTrailingStop(true, 0.02, 0.04);

      expect(builder['template'].parameters.trailing_stop).toBe(true);
      expect(builder['template'].parameters.trailing_stop_positive).toBe(0.02);
      expect(builder['template'].parameters.trailing_stop_positive_offset).toBe(0.04);
    });

    it('should use default values', () => {
      const builder = new StrategyBuilder('Test');
      builder.setTrailingStop();

      expect(builder['template'].parameters.trailing_stop).toBe(true);
      expect(builder['template'].parameters.trailing_stop_positive).toBe(0.02);
      expect(builder['template'].parameters.trailing_stop_positive_offset).toBe(0.04);
    });
  });

  describe('setStopLoss', () => {
    it('should set stoploss parameter', () => {
      const builder = new StrategyBuilder('Test');
      builder.setStopLoss(-0.2);

      expect(builder['template'].parameters.stoploss).toBe(-0.2);
    });
  });

  describe('compile', () => {
    it('should compile the built template', () => {
      const builder = new StrategyBuilder('MyStrategy')
        .setTimeframe('1h')
        .addIndicator({
          name: 'ema',
          function: 'EMA',
          params: { timeperiod: 20 },
          input: 'close',
          output: 'ema',
        })
        .addEntryCondition({ left: 'ema', operator: '>', right: 100 })
        .addExitCondition({ left: 'ema', operator: '<', right: 50 })
        .setStopLoss(-0.1);

      const compiled = builder.compile();

      expect(compiled.className).toBe('MyStrategy');
      expect(compiled.fileName).toBe('my_strategy.py');
      expect(compiled.code).toContain('class MyStrategy(IStrategy):');
      expect(compiled.code).toContain("dataframe['ema'] = ta.EMA(dataframe, timeperiod=20)");
    });
  });

  describe('validate', () => {
    it('should validate the built template', async () => {
      const builder = new StrategyBuilder('Valid')
        .setTimeframe('5m')
        .addIndicator({
          name: 'rsi',
          function: 'RSI',
          params: { timeperiod: 14 },
          input: 'close',
          output: 'rsi',
        })
        .addEntryCondition({ left: 'rsi', operator: '<', right: 30 });

      const result = await builder.validate();

      expect(result.valid).toBe(true);
    });
  });

  describe('Static factory methods', () => {
    describe('createMACross', () => {
      it('should create MA Cross strategy with defaults', () => {
        const builder = StrategyBuilder.createMACross('MA Cross');

        expect(builder['template'].name).toBe('MA Cross');
        expect(builder['template'].indicators).toHaveLength(2);

        const emaFast = builder['template'].indicators.find(i => i.name === 'ema_fast');
        const emaSlow = builder['template'].indicators.find(i => i.name === 'ema_slow');

        expect(emaFast).toBeDefined();
        expect(emaFast!.params.timeperiod).toBe(10);
        expect(emaSlow!.params.timeperiod).toBe(21);

        expect(builder['template'].entryConditions).toHaveLength(1);
        expect((builder['template'].entryConditions[0] as Condition).left).toBe('ema_fast');
        expect((builder['template'].entryConditions[0] as Condition).operator).toBe('>');
        expect((builder['template'].entryConditions[0] as Condition).right).toBe('ema_slow');
      });

      it('should accept custom periods', () => {
        const builder = StrategyBuilder.createMACross('Custom MA', 20, 50, '4h');

        expect(builder['template'].timeframe).toBe('4h');
        const emaFast = builder['template'].indicators.find(i => i.name === 'ema_fast');
        const emaSlow = builder['template'].indicators.find(i => i.name === 'ema_slow');
        expect(emaFast!.params.timeperiod).toBe(20);
        expect(emaSlow!.params.timeperiod).toBe(50);
      });

      it('should set stoploss by default', () => {
        const builder = StrategyBuilder.createMACross('Test');

        expect(builder['template'].parameters.stoploss).toBe(-0.1);
      });
    });

    describe('createRSIStrategy', () => {
      it('should create RSI strategy with defaults', () => {
        const builder = StrategyBuilder.createRSIStrategy('RSI Mean Reversion');

        expect(builder['template'].indicators).toHaveLength(1);
        const rsiIndicator = builder['template'].indicators[0];
        expect(rsiIndicator.name).toBe('rsi');
        expect(rsiIndicator.params.timeperiod).toBe(14);

        expect(builder['template'].entryConditions).toHaveLength(1);
        expect((builder['template'].entryConditions[0] as Condition).right).toBe(30);

        expect(builder['template'].exitConditions).toHaveLength(1);
        expect((builder['template'].exitConditions[0] as Condition).right).toBe(70);
      });

      it('should accept custom RSI periods and thresholds', () => {
        const builder = StrategyBuilder.createRSIStrategy('Custom RSI', 21, 20, 80);

        const rsiIndicator = builder['template'].indicators[0];
        expect(rsiIndicator.params.timeperiod).toBe(21);
        expect((builder['template'].entryConditions[0] as Condition).right).toBe(20);
        expect((builder['template'].exitConditions[0] as Condition).right).toBe(80);
      });
    });

    describe('createMACDStrategy', () => {
      it('should create MACD strategy with defaults', () => {
        const builder = StrategyBuilder.createMACDStrategy('MACD Cross');

        expect(builder['template'].indicators).toHaveLength(2); // macd_line and signal_line

        const macdLine = builder['template'].indicators.find(i => i.output === 'macd_line');
        const signalLine = builder['template'].indicators.find(i => i.output === 'signal_line');

        expect(macdLine).toBeDefined();
        expect(signalLine).toBeDefined();

        expect(builder['template'].entryConditions).toHaveLength(1);
        expect((builder['template'].entryConditions[0] as Condition).right).toBe('signal_line');
        expect((builder['template'].entryConditions[0] as Condition).rightIsColumn).toBe(true);
      });

      it('should accept custom MACD parameters', () => {
        const builder = StrategyBuilder.createMACDStrategy('Custom MACD', 10, 30, 12);

        const macdIndicator = builder['template'].indicators.find(i => i.output === 'macd_line');
        expect(macdIndicator!.params.fastperiod).toBe(10);
        expect(macdIndicator!.params.slowperiod).toBe(30);
        expect(macdIndicator!.params.signalperiod).toBe(12);
      });
    });
  });
});

describe('Utility functions', () => {
  describe('getParameterFromSpace', () => {
    it('should get parameter with default', () => {
      const space: ParameterSpace = {
        my_param: new DecimalParameter('my_param', 0.0, 1.0, 0.5),
      };

      const value = getParameterFromSpace(space, 'my_param');
      expect(value).toBe(0.5);
    });

    it('should return null if no default', () => {
      // Create a parameter without default (hack: undefined default)
      const param = new DecimalParameter('test', 0.0, 1.0);
      // Override default to undefined
      (param as any).default = undefined;

      const space: ParameterSpace = { test: param };
      const value = getParameterFromSpace(space, 'test');
      expect(value).toBeNull();
    });

    it('should throw for missing parameter', () => {
      const space: ParameterSpace = {};
      expect(() => getParameterFromSpace(space, 'missing')).toThrow('Parameter "missing" not found in space');
    });
  });

  describe('mergeTemplates', () => {
    it('should merge multiple templates', () => {
      const t1: StrategyTemplate = {
        name: 'Base',
        timeframe: '5m',
        indicators: [
          { name: 'ema1', function: 'EMA', params: { timeperiod: 10 }, input: 'close', output: 'ema1' },
        ],
        entryConditions: [
          { left: 'ema1', operator: '>', right: 100 },
        ],
        exitConditions: [],
        parameters: { stoploss: -0.1 },
      };

      const t2: StrategyTemplate = {
        name: 'Extension',
        timeframe: '1h',
        indicators: [
          { name: 'ema2', function: 'EMA', params: { timeperiod: 20 }, input: 'close', output: 'ema2' },
        ],
        entryConditions: [
          { left: 'ema2', operator: '>', right: 200 },
        ],
        exitConditions: [
          { left: 'ema2', operator: '<', right: 150 },
        ],
        parameters: { trailing_stop: true },
      };

      const merged = mergeTemplates(t1, t2);

      expect(merged.name).toBe('Base'); // First's name
      expect(merged.indicators).toHaveLength(2);
      expect(merged.entryConditions).toHaveLength(2);
      expect(merged.exitConditions).toHaveLength(1);
      expect(merged.parameters).toEqual({
        stoploss: -0.1,
        trailing_stop: true,
      });
    });

    it('should throw if no templates provided', () => {
      expect(() => mergeTemplates()).toThrow('At least one template required');
    });
  });
});
