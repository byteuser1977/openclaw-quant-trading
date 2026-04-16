import { StrategyValidator, validateStrategy, ValidationResult } from '../../../../src/skills/strategy/validator';
import { IntParameter, DecimalParameter, ParameterSpaceContainer } from '../../../../src/skills/strategy/parameters';

describe('StrategyValidator', () => {
  let validator: StrategyValidator;

  beforeEach(() => {
    validator = new StrategyValidator();
  });

  describe('validateBasicConfig', () => {
    it('should reject missing name', async () => {
      const config = {
        name: '',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70',
        timeframe: '5m'
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_NAME')).toBe(true);
    });

    it('should reject missing timeframe', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70',
        timeframe: ''
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_TIMEFRAME')).toBe(true);
    });

    it('should reject invalid timeframe format', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        timeframe: '5min', // invalid
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_TIMEFRAME')).toBe(true);
    });

    it('should accept valid config', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      if (!result.valid) {
        console.log('Validation errors:', JSON.stringify(result.errors, null, 2));
        console.log('Validation warnings:', JSON.stringify(result.warnings, null, 2));
      }
      expect(result.valid).toBe(true);
    });
  });

  describe('validateParameterReferences', () => {
    it('should detect unknown parameter in buy condition', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [
          { name: 'rsi', type: 'integer' }
        ],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi < 30 and unknown_param > 50',
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNKNOWN_PARAMETER' && e.location === 'buyCondition')).toBe(true);
    });

    it('should detect unknown parameter in sell condition', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [
          { name: 'rsi', type: 'integer' }
        ],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70 || flag == true'
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNKNOWN_PARAMETER' && e.location === 'sellCondition')).toBe(true);
    });

    it('should accept valid parameter references', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [
          { name: 'rsi', type: 'integer' },
          { name: 'buy_threshold', type: 'integer' },
          { name: 'sell_threshold', type: 'integer' }
        ],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi < buy_threshold',
        sellCondition: 'rsi > sell_threshold'
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateIndicators', () => {
    it('should warn on no indicators', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      expect(result.warnings.some(w => w.code === 'NO_INDICATORS')).toBe(true);
    });

    it('should warn on unknown indicator', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: ['CustomIndicator'],
        timeframe: '5m',
        buyCondition: 'foo > 50',
        sellCondition: 'foo < 50'
      };
      const result = await validator.validate(config);
      expect(result.warnings.some(w => w.code === 'UNKNOWN_INDICATOR')).toBe(true);
    });

    it('should accept known indicators', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [
          { name: 'rsi', type: 'integer' },
          { name: 'macd', type: 'decimal' },
          { name: 'signal', type: 'decimal' }
        ],
        indicators: ['RSI', 'MACD'],
        timeframe: '5m',
        buyCondition: 'rsi < 30 and macd > signal',
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      if (!result.valid) {
        console.log('Errors:', JSON.stringify(result.errors, null, 2));
        console.log('Warnings:', JSON.stringify(result.warnings, null, 2));
      }
      expect(result.valid).toBe(true);
    });
  });

  describe('validateConditions', () => {
    it('should warn about possible assignment', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi = 30', // should be ==
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      expect(result.warnings.some(w => w.code === 'POSSIBLE_ASSIGNMENT')).toBe(true);
    });

    it('should accept comparison operators', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        timeframe: '5m',
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi >= 70'
      };
      const result = await validator.validate(config);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateSecurity', () => {
    it('should warn on forbidden functions', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [],
        indicators: [],
        timeframe: '5m',
        buyCondition: "eval('malicious')",
        sellCondition: 'rsi > 70'
      };
      const result = await validator.validate(config);
      expect(result.warnings.some(w => w.code === 'FORBIDDEN_FUNCTION')).toBe(true);
    });
  });

  describe('validateFreqtradeInterface', () => {
    it('should detect missing IStrategy inheritance', () => {
      const code = `
class MyStrategy:
    def populate_indicators(self, df, metadata):
        return df
      `;
      const result = validator.validateFreqtradeInterface('MyStrategy', code);
      expect(result.errors.some(e => e.code === 'MISSING_ISTRATEGY')).toBe(true);
    });

    it('should detect missing required methods', () => {
      const code = `
from freqtrade.strategy import IStrategy
class MyStrategy(IStrategy):
    def populate_indicators(self, df, metadata):
        return df
      `;
      const result = validator.validateFreqtradeInterface('MyStrategy', code);
      expect(result.errors.some(e => e.code === 'MISSING_METHOD')).toBe(true);
    });

    it('should accept valid strategy', () => {
      const code = `
from freqtrade.strategy import IStrategy
class MyStrategy(IStrategy):
    timeframe = '5m'
    def populate_indicators(self, df, metadata):
        return df
    def populate_buy_trend(self, df, metadata):
        df['buy'] = False
        return df
    def populate_sell_trend(self, df, metadata):
        df['sell'] = False
        return df
      `;
      const result = validator.validateFreqtradeInterface('MyStrategy', code);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateStrategy helper', () => {
    it('should combine all validations', async () => {
      const config = {
        name: 'TestStrategy',
        className: 'TestStrategy',
        parameters: [
          { name: 'rsi', type: 'integer', min: 10, max: 100 }
        ],
        indicators: ['RSI'],
        timeframe: '5m',
        buyCondition: 'rsi < 30',
        sellCondition: 'rsi > 70'
      };
      const result = await validateStrategy(config);
      expect(result.valid).toBe(true);
    });
  });
});
