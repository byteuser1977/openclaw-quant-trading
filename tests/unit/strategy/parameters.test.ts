/**
 * Unit tests for Strategy Parameter System
 */

import {
  Parameter,
  IntParameter,
  DecimalParameter,
  BooleanParameter,
  CategoricalParameter,
  ParameterSpaceBuilder,
  ParameterSpace,
  StrategyParameters,
  createParameterSpace,
  mergeParameterSpaces,
} from '../../src/skills/strategy/parameters';

describe('Parameter System', () => {
  describe('IntParameter', () => {
    it('should create integer parameter with bounds', () => {
      const param = new IntParameter('rsi_period', 10, 50, 14, 'RSI period');
      expect(param.name).toBe('rsi_period');
      expect(param.type).toBe('int');
      expect(param.low).toBe(10);
      expect(param.high).toBe(50);
      expect(param.default).toBe(14);
    });

    it('should validate integer values within range', () => {
      const param = new IntParameter('test', 1, 100, 50);
      expect(param.validate(50)).toBe(true);
      expect(param.validate(1)).toBe(true);
      expect(param.validate(100)).toBe(true);
      expect(param.validate(0)).toBe(false);
      expect(param.validate(101)).toBe(false);
      expect(param.validate(10.5)).toBe(false); // Not integer
    });

    it('should throw if default out of bounds', () => {
      expect(() => new IntParameter('bad', 1, 10, 20)).toThrow();
    });
  });

  describe('DecimalParameter', () => {
    it('should create decimal parameter', () => {
      const param = new DecimalParameter('stoploss', -0.2, -0.02, -0.1, 0.01, 'Stop loss');
      expect(param.name).toBe('stoploss');
      expect(param.type).toBe('decimal');
      expect(param.low).toBe(-0.2);
      expect(param.high).toBe(-0.02);
      expect(param.default).toBe(-0.1);
    });

    it('should validate decimal values', () => {
      const param = new DecimalParameter('risk', 0.001, 0.05, 0.02);
      expect(param.validate(0.02)).toBe(true);
      expect(param.validate(0.001)).toBe(true);
      expect(param.validate(0.05)).toBe(true);
      expect(param.validate(0.0)).toBe(false);
      expect(param.validate(0.06)).toBe(false);
    });
  });

  describe('BooleanParameter', () => {
    it('should create boolean parameter', () => {
      const param = new BooleanParameter('trailing_stop', true, 'Use trailing stop');
      expect(param.name).toBe('trailing_stop');
      expect(param.type).toBe('boolean');
      expect(param.default).toBe(true);
    });

    it('should validate boolean values', () => {
      const param = new BooleanParameter('flag', false);
      expect(param.validate(true)).toBe(true);
      expect(param.validate(false)).toBe(true);
      expect(param.validate(1)).toBe(false);
      expect(param.validate('true')).toBe(false);
    });
  });

  describe('CategoricalParameter', () => {
    it('should create categorical parameter', () => {
      const param = new CategoricalParameter(
        'signal_method',
        ['macd', 'rsi', 'bbands'],
        'rsi',
        'Signal method'
      );
      expect(param.choices).toEqual(['macd', 'rsi', 'bbands']);
      expect(param.default).toBe('rsi');
    });

    it('should validate categorical values', () => {
      const param = new CategoricalParameter('cat', ['a', 'b', 'c'], 'a');
      expect(param.validate('a')).toBe(true);
      expect(param.validate('c')).toBe(true);
      expect(param.validate('d')).toBe(false);
    });

    it('should throw if no choices', () => {
      expect(() => new CategoricalParameter('bad', [])).toThrow();
    });
  });

  describe('ParameterSpaceBuilder', () => {
    it('should build parameter space', () => {
      const builder = new ParameterSpaceBuilder()
        .addInt('period', 10, 50, 14)
        .addDecimal('threshold', 0.1, 0.5, 0.3)
        .addBoolean('enable', true)
        .addCategorical('method', ['a', 'b'], 'a');

      const space = builder.build();
      expect(Object.keys(space).length).toBe(4);
      expect(space['period'] instanceof IntParameter).toBe(true);
      expect(space['threshold'] instanceof DecimalParameter).toBe(true);
      expect(space['enable'] instanceof BooleanParameter).toBe(true);
      expect(space['method'] instanceof CategoricalParameter).toBe(true);
    });

    it('should throw on duplicate parameter', () => {
      const builder = new ParameterSpaceBuilder()
        .addInt('x', 1, 10, 5)
        .addInt('x', 1, 10, 5);
      expect(() => builder.build()).toThrow('Parameter "x" already exists');
    });

    it('should validate parameter values', () => {
      const builder = new ParameterSpaceBuilder()
        .addInt('count', 1, 100, 10)
        .addBoolean('flag', false);

      const space = builder.build();
      const result = space.validate({ count: 50, flag: true });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      const badResult = space.validate({ count: 200, flag: true });
      expect(badResult.valid).toBe(false);
      expect(badResult.errors.length).toBeGreaterThan(0);
    });

    it('should generate random samples', () => {
      const builder = new ParameterSpaceBuilder()
        .addInt('int_param', 1, 10, 5)
        .addDecimal('dec_param', 0.0, 1.0, 0.5)
        .addBoolean('bool_param', false)
        .addCategorical('cat_param', ['x', 'y', 'z'], 'x');

      const space = builder.build();
      const sample = space.generateRandomSample();

      expect(sample.int_param).toBeGreaterThanOrEqual(1);
      expect(sample.int_param).toBeLessThanOrEqual(10);
      expect(typeof sample.bool_param).toBe('boolean');
      expect(['x', 'y', 'z']).toContain(sample.cat_param);
      expect(sample.dec_param).toBeGreaterThanOrEqual(0.0);
      expect(sample.dec_param).toBeLessThanOrEqual(1.0);
    });

    it('should provide default values when missing', () => {
      const builder = new ParameterSpaceBuilder()
        .addInt('with_default', 1, 10, 5)
        .addInt('no_default', 1, 10); // No default

      const space = builder.build();
      const result = space.validate({}); // Empty values

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required parameter: no_default');
    });
  });

  describe('StrategyParameters presets', () => {
    it('should create ROI step parameter', () => {
      const builder = StrategyParameters.roiStep();
      const space = builder.build();
      expect(space['roi_step']).toBeDefined();
      expect(space['roi_step'].type).toBe('decimal');
    });

    it('should create stoploss parameter', () => {
      const builder = StrategyParameters.stoploss(-0.2, -0.02);
      const space = builder.build();
      expect(space['stoploss']).toBeDefined();
      expect((space['stoploss'] as DecimalParameter).low).toBe(-0.2);
    });

    it('should create trailing stop parameters', () => {
      const builder = StrategyParameters.trailingStop();
      const space = builder.build();
      expect(space['trailing_stop']).toBeDefined();
      expect(space['trailing_stop_positive']).toBeDefined();
      expect(space['trailing_stop_positive_offset']).toBeDefined();
    });

    it('should create RSI period parameter', () => {
      const builder = StrategyParameters.rsiPeriod();
      const space = builder.build();
      expect(space['rsi_period']).toBeDefined();
      expect(space['rsi_period'].type).toBe('int');
    });

    it('should create EMA periods parameters', () => {
      const builder = StrategyParameters.emaPeriods(5, 50);
      const space = builder.build();
      expect(space['ema_fast']).toBeDefined();
      expect(space['ema_slow']).toBeDefined();
    });

    it('should create MACD parameters', () => {
      const builder = StrategyParameters.macdParams();
      const space = builder.build();
      expect(space['macd_fast']).toBeDefined();
      expect(space['macd_slow']).toBeDefined();
      expect(space['macd_signal']).toBeDefined();
    });
  });

  describe('createParameterSpace', () => {
    it('should create from builder function', () => {
      const space = createParameterSpace('test', () =>
        new ParameterSpaceBuilder().addInt('x', 1, 10, 5)
      );
      expect(space['x']).toBeDefined();
    });

    it('should create from builder directly', () => {
      const builder = new ParameterSpaceBuilder().addBoolean('flag', false);
      const space = createParameterSpace('test', builder);
      expect(space['flag']).toBeDefined();
    });
  });

  describe('mergeParameterSpaces', () => {
    it('should merge multiple spaces', () => {
      const space1: ParameterSpace = {
        a: new IntParameter('a', 1, 10, 5),
      };
      const space2: ParameterSpace = {
        b: new DecimalParameter('b', 0.0, 1.0, 0.5),
      };

      const merged = mergeParameterSpaces(space1, space2);
      expect(Object.keys(merged).length).toBe(2);
      expect(merged['a']).toBeDefined();
      expect(merged['b']).toBeDefined();
    });

    it('should overwrite duplicate keys with warning', () => {
      const space1: ParameterSpace = {
        a: new IntParameter('a', 1, 10, 5),
      };
      const space2: ParameterSpace = {
        a: new IntParameter('a', 1, 20, 10), // Different bounds
      };

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const merged = mergeParameterSpaces(space1, space2);
      expect(merged['a']).toBe(space2['a']); // Second wins
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"a" overwritten'));
      consoleSpy.mockRestore();
    });
  });
});
