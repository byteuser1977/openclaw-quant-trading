import {
  IntParameter,
  DecimalParameter,
  BooleanParameter,
  CategoricalParameter,
  ParameterSpaceContainer,
  ParameterType,
  ParameterSpace,
  createParameterSpace
} from '../../../../src/skills/strategy/parameters';

describe('IntParameter', () => {
  describe('constructor', () => {
    it('should create valid int parameter', () => {
      const param = new IntParameter('rsi_period', 10, 30);
      expect(param.name).toBe('rsi_period');
      expect(param.min).toBe(10);
      expect(param.max).toBe(30);
      expect(param.type).toBe(ParameterType.INTEGER);
      expect(param.group).toBe(ParameterSpace.COMMON);
    });

    it('should accept custom step', () => {
      const param = new IntParameter('period', 5, 30, { step: 5 });
      expect(param.step).toBe(5);
    });

    it('should accept default value', () => {
      const param = new IntParameter('period', 5, 30, { default: 14 });
      expect(param.default).toBe(14);
    });

    it('should throw if min >= max', () => {
      expect(() => new IntParameter('bad', 10, 10)).toThrow('min.*max');
      expect(() => new IntParameter('bad', 30, 10)).toThrow('min.*max');
    });

    it('should accept custom group', () => {
      const param = new IntParameter('rsi', 10, 30, { group: ParameterSpace.BUY });
      expect(param.group).toBe(ParameterSpace.BUY);
    });
  });

  describe('validate', () => {
    let param: IntParameter;

    beforeEach(() => {
      param = new IntParameter('test', 1, 100);
    });

    it('should accept valid integer', () => {
      expect(param.validate(50)).toEqual({ valid: true });
    });

    it('should reject non-integer', () => {
      expect(param.validate(5.5)).toEqual({ valid: false, error: 'must be an integer' });
    });

    it('should reject value below min', () => {
      expect(param.validate(0)).toEqual({ valid: false, error: 'out of range' });
    });

    it('should reject value above max', () => {
      expect(param.validate(101)).toEqual({ valid: false, error: 'out of range' });
    });

    it('should reject out-of-range with step', () => {
      const paramWithStep = new IntParameter('test', 0, 10, { step: 2 });
      expect(paramWithStep.validate(5)).toEqual({ valid: false, error: 'step' });
    });

    it('should accept boundary values', () => {
      expect(param.validate(1)).toEqual({ valid: true });
      expect(param.validate(100)).toEqual({ valid: true });
    });
  });

  describe('sample', () => {
    it('should return value within range', () => {
      const param = new IntParameter('test', 10, 20);
      for (let i = 0; i < 100; i++) {
        const value = param.sample();
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(20);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should respect step', () => {
      const param = new IntParameter('test', 0, 10, { step: 2 });
      for (let i = 0; i < 100; i++) {
        const value = param.sample();
        expect(value % 2).toBe(0);
      }
    });
  });

  describe('toJSON', () => {
    it('should export correct schema', () => {
      const param = new IntParameter('rsi', 10, 30, { step: 2, default: 14, group: ParameterSpace.BUY });
      const json = param.toJSON();
      expect(json).toEqual({
        name: 'rsi',
        type: ParameterType.INTEGER,
        min: 10,
        max: 30,
        step: 2,
        default: 14,
        description: 'Integer parameter rsi (10-30)'
      });
    });
  });
});

describe('DecimalParameter', () => {
  describe('constructor', () => {
    it('should create valid decimal parameter', () => {
      const param = new DecimalParameter('stoploss', -0.2, -0.05);
      expect(param.name).toBe('stoploss');
      expect(param.min).toBe(-0.2);
      expect(param.max).toBe(-0.05);
      expect(param.type).toBe(ParameterType.DECIMAL);
    });

    it('should throw if min >= max', () => {
      expect(() => new DecimalParameter('bad', -0.1, -0.1)).toThrow('min.*max');
    });
  });

  describe('validate', () => {
    let param: DecimalParameter;

    beforeEach(() => {
      param = new DecimalParameter('test', 0.0, 1.0);
    });

    it('should accept valid decimal', () => {
      expect(param.validate(0.5)).toEqual({ valid: true });
    });

    it('should reject non-number', () => {
      expect(param.validate('0.5')).toEqual({ valid: false, error: 'must be a number' });
    });

    it('should reject out of range', () => {
      expect(param.validate(-0.1)).toEqual({ valid: false, error: 'out of range' });
      expect(param.validate(1.1)).toEqual({ valid: false, error: 'out of range' });
    });

    it('should respect precision', () => {
      const precise = new DecimalParameter('test', 0, 1, { precision: 2 });
      expect(precise.validate(0.123)).toEqual({ valid: false, error: 'precision' });
      expect(precise.validate(0.12)).toEqual({ valid: true });
    });
  });

  describe('sample', () => {
    it('should return value within range', () => {
      const param = new DecimalParameter('test', 0.0, 1.0);
      for (let i = 0; i < 100; i++) {
        const value = param.sample();
        expect(value).toBeGreaterThanOrEqual(0.0);
        expect(value).toBeLessThanOrEqual(1.0);
      }
    });

    it('should respect precision', () => {
      const param = new DecimalParameter('test', 0.0, 1.0, { precision: 3 });
      for (let i = 0; i < 100; i++) {
        const value = param.sample();
        const decimals = value.toString().split('.')[1]?.length || 0;
        expect(decimals).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('toJSON', () => {
    it('should export schema with precision', () => {
      const param = new DecimalParameter('ratio', 0.01, 0.10, { precision: 4, default: 0.02 });
      const json = param.toJSON();
      expect(json.precision).toBe(4);
      expect(json.default).toBe(0.02);
    });
  });
});

describe('BooleanParameter', () => {
  describe('validate', () => {
    let param: BooleanParameter;

    beforeEach(() => {
      param = new BooleanParameter('flag');
    });

    it('should accept true/false', () => {
      expect(param.validate(true)).toEqual({ valid: true });
      expect(param.validate(false)).toEqual({ valid: true });
    });

    it('should reject non-boolean', () => {
      expect(param.validate('yes')).toEqual({ valid: false, error: 'boolean' });
      expect(param.validate(1)).toEqual({ valid: false, error: 'boolean' });
    });
  });

  describe('sample', () => {
    it('should return random boolean', () => {
      const param = new BooleanParameter('flag');
      for (let i = 0; i < 20; i++) {
        const value = param.sample();
        expect(typeof value).toBe('boolean');
      }
    });
  });

  describe('toJSON', () => {
    it('should export schema without min/max', () => {
      const param = new BooleanParameter('use_trailing', { default: true, group: ParameterSpace.BUY });
      const json = param.toJSON();
      expect(json).toEqual({
        name: 'use_trailing',
        type: ParameterType.BOOLEAN,
        default: true,
        description: 'Boolean parameter use_trailing'
      });
      expect(json.min).toBeUndefined();
      expect(json.max).toBeUndefined();
    });
  });
});

describe('CategoricalParameter', () => {
  describe('constructor', () => {
    it('should create with options', () => {
      const param = new CategoricalParameter('ma_type', ['ema', 'sma', 'wma']);
      expect(param.name).toBe('ma_type');
      expect(param.options).toEqual(['ema', 'sma', 'wma']);
      expect(param.type).toBe(ParameterType.CATEGORICAL);
    });

    it('should throw if options empty', () => {
      expect(() => new CategoricalParameter('bad', [])).toThrow('empty');
    });

    it('should throw if only one option', () => {
      expect(() => new CategoricalParameter('bad', ['only'])).toThrow('at least 2');
    });
  });

  describe('validate', () => {
    let param: CategoricalParameter;

    beforeEach(() => {
      param = new CategoricalParameter('type', ['ema', 'sma', 'wma']);
    });

    it('should accept valid option', () => {
      expect(param.validate('ema')).toEqual({ valid: true });
      expect(param.validate('sma')).toEqual({ valid: true });
    });

    it('should reject invalid option', () => {
      expect(param.validate('tma')).toEqual({ valid: false, error: "not in options" });
    });
  });

  describe('sample', () => {
    it('should return random option', () => {
      const param = new CategoricalParameter('type', ['ema', 'sma', 'wma']);
      const options = new Set<string>();
      for (let i = 0; i < 100; i++) {
        options.add(param.sample());
      }
      // Should sample all options eventually (probabilistic)
      expect(options.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('toJSON', () => {
    it('should export options array', () => {
      const param = new CategoricalParameter('ma_type', ['ema', 'sma']);
      const json = param.toJSON();
      expect(json.options).toEqual(['ema', 'sma']);
      expect(json.type).toBe(ParameterType.CATEGORICAL);
    });
  });
});

describe('ParameterSpaceContainer', () => {
  describe('add and get', () => {
    it('should add parameters to specific space', () => {
      const space = new ParameterSpaceContainer();
      const param = new IntParameter('rsi', 10, 30, { group: ParameterSpace.BUY });

      space.add(ParameterSpace.BUY, param);
      const buyParams = space.getSpace(ParameterSpace.BUY);

      expect(buyParams).toHaveLength(1);
      expect(buyParams[0].name).toBe('rsi');
    });

    it('should throw on duplicate parameter name in same space', () => {
      const space = new ParameterSpaceContainer();
      const p1 = new IntParameter('rsi', 10, 30, { group: ParameterSpace.BUY });
      const p2 = new IntParameter('rsi', 5, 50, { group: ParameterSpace.BUY });

      space.add(ParameterSpace.BUY, p1);
      expect(() => space.add(ParameterSpace.BUY, p2)).toThrow('already exists');
    });

    it('should allow same name in different spaces', () => {
      const space = new ParameterSpaceContainer();
      const p1 = new IntParameter('rsi', 10, 30, { group: ParameterSpace.BUY });
      const p2 = new IntParameter('rsi', 5, 50, { group: ParameterSpace.SELL });

      space.add(ParameterSpace.BUY, p1);
      space.add(ParameterSpace.SELL, p2);

      expect(space.getSpace(ParameterSpace.BUY)).toHaveLength(1);
      expect(space.getSpace(ParameterSpace.SELL)).toHaveLength(1);
    });
  });

  describe('addGroup', () => {
    it('should add multiple parameters at once', () => {
      const space = new ParameterSpaceContainer();
      space.addGroup(ParameterSpace.BUY, {
        rsi: new IntParameter('rsi', 10, 30),
        ma: new CategoricalParameter('ma_type', ['ema', 'sma'])
      });

      const buyParams = space.getSpace(ParameterSpace.BUY);
      expect(buyParams).toHaveLength(2);
    });
  });

  describe('find', () => {
    it('should find parameter by name across spaces', () => {
      const space = new ParameterSpaceContainer();
      space.add(ParameterSpace.BUY, new IntParameter('rsi', 10, 30, { group: ParameterSpace.BUY }));
      space.add(ParameterSpace.SELL, new IntParameter('rsi', 20, 40, { group: ParameterSpace.SELL }));

      const found = space.find('rsi');
      expect(found).toBeDefined();
      expect(found?.name).toBe('rsi');
      // Finds first occurrence
    });

    it('should return undefined for non-existent', () => {
      const space = new ParameterSpaceContainer();
      expect(space.find('unknown')).toBeUndefined();
    });
  });

  describe('validate', () => {
    it('should validate all provided parameters', () => {
      const space = new ParameterSpaceContainer();
      space.add(ParameterSpace.BUY, new IntParameter('rsi', 10, 30));
      space.add(ParameterSpace.SELL, new BooleanParameter('use_exit'));

      const result = space.validate({
        rsi: 14,
        use_exit: true
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch invalid values', () => {
      const space = new ParameterSpaceContainer();
      space.add(ParameterSpace.BUY, new IntParameter('rsi', 10, 30));

      const result = space.validate({ rsi: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('rsi');
    });

    it('should catch missing required parameters', () => {
      const space = new ParameterSpaceContainer();
      space.add(ParameterSpace.BUY, new IntParameter('rsi', 10, 30)); // no default

      const result = space.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('rsi');
      expect(result.errors[0]).toContain('required');
    });

    it('should accept parameters with default when missing', () => {
      const space = new ParameterSpaceContainer();
      space.add(ParameterSpace.BUY, new IntParameter('rsi', 10, 30, { default: 14 }));

      const result = space.validate({});
      expect(result.valid).toBe(true);
    });
  });

  describe('sampleRandom', () => {
    it('should generate random values for all parameters', () => {
      const space = new ParameterSpaceContainer();
      space.addGroup(ParameterSpace.BUY, {
        rsi: new IntParameter('rsi', 10, 30),
        stoploss: new DecimalParameter('stoploss', -0.2, -0.05),
        use_trailing: new BooleanParameter('use_trailing')
      });

      const sample = space.sampleRandom();
      expect(sample).toHaveProperty('rsi');
      expect(sample).toHaveProperty('stoploss');
      expect(sample).toHaveProperty('use_trailing');
      expect(typeof sample.rsi).toBe('number');
      expect(typeof sample.stoploss).toBe('number');
      expect(typeof sample.use_trailing).toBe('boolean');
    });
  });

  describe('toJSON', () => {
    it('should export complete schema', () => {
      const space = new ParameterSpaceContainer();
      space.add(ParameterSpace.BUY, new IntParameter('rsi', 10, 30, { group: ParameterSpace.BUY }));

      const json = space.toJSON();
      expect(json.all).toHaveLength(1);
      expect(json.spaces[ParameterSpace.BUY]).toHaveLength(1);
      expect(json.spaces[ParameterSpace.BUY][0].name).toBe('rsi');
    });
  });
});

describe('createParameterSpace helper', () => {
  it('should create empty ParameterSpaceContainer', () => {
    const space = createParameterSpace();
    expect(space).toBeInstanceOf(ParameterSpaceContainer);
    expect(space.getAll()).toHaveLength(0);
  });
});
