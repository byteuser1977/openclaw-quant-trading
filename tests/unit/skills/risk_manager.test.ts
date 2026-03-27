import { getRiskManager, RiskManager } from '@/skills/risk';

describe('RiskManager', () => {
  let rm: RiskManager;

  beforeAll(() => {
    rm = getRiskManager();
    rm.reset(); // Ensure clean state
  });

  describe('calculatePositionSize', () => {
    beforeEach(() => {
      rm.reset();
    });

    test('fixed_amount should return specified amount', () => {
      const size = rm.calculatePositionSize({
        method: 'fixed_amount',
        amount: 1000,
      }, { balance: 10000 });
      expect(size).toBe(1000);
    });

    test('fixed_ratio should return balance * ratio', () => {
      const size = rm.calculatePositionSize({
        method: 'fixed_ratio',
        riskPerTrade: 0.1, // 10%
      }, { balance: 10000 });
      expect(size).toBe(1000);
    });

    test('kelly should compute Kelly fraction', () => {
      // Kelly: f* = (p*b - q) / b
      // p=0.6, q=0.4, b=2 (win/loss ratio)
      const size = rm.calculatePositionSize({
        method: 'kelly',
        winRate: 0.6,
        avgWin: 200,
        avgLoss: 100,
      }, { balance: 10000 });
      // p*b - q = 0.6*2 - 0.4 = 1.2 - 0.4 = 0.8; f = 0.8/2 = 0.4 => 40% of balance
      expect(size).toBeCloseTo(4000, 0);
    });

    test('should respect max_position_size limit', () => {
      const size = rm.calculatePositionSize({
        method: 'fixed_ratio',
        riskPerTrade: 0.5, // 50%
        maxPositionSize: 2000,
      }, { balance: 10000 });
      expect(size).toBe(2000);
    });
  });

  describe('calculateStoploss', () => {
    test('fixed type should compute correct stop price', () => {
      const stop = rm.calculateStoploss({
        type: 'fixed',
        entryPrice: 100,
        stoplossPct: 0.1, // 10%
      }, { side: 'BUY' });
      expect(stop).toBe(90); // 100 * 0.9
    });

    test('fixed type for SELL side', () => {
      const stop = rm.calculateStoploss({
        type: 'fixed',
        entryPrice: 100,
        stoplossPct: 0.1,
      }, { side: 'SELL' });
      expect(stop).toBe(110); // 100 * 1.1
    });

    test('trailing type should compute initial stop', () => {
      const stop = rm.calculateStoploss({
        type: 'trailing',
        entryPrice: 100,
        trailingPct: 0.05,
        currentPrice: 110, // price moved up
      }, { side: 'BUY' });
      // For BUY, trailing stop is below current price
      expect(stop).toBeGreaterThan(100); // should be above entry due to price increase
      expect(stop).toBeCloseTo(110 * 0.95, 0); // 104.5
    });

    test('atr type should compute based on ATR', () => {
      const stop = rm.calculateStoploss({
        type: 'atr',
        entryPrice: 100,
        atr: 5,
        atrMultiplier: 2,
      }, { side: 'BUY' });
      expect(stop).toBe(90); // 100 - 2*5
    });
  });

  describe('checkCircuitBreaker', () => {
    beforeEach(() => {
      rm.reset();
    });

    test('should trigger on daily loss exceeding threshold', () => {
      rm.updateDailyMetrics({ dailyPnL: -2000, startOfDayBalance: 10000 });
      const circuit = rm.checkCircuitBreaker({ 
        dailyLossThreshold: 0.15, // 15%
      });
      expect(circuit.triggered).toBe(true);
      expect(circuit.level).toBe(1); // L1
    });

    test('should trigger on consecutive losses', () => {
      rm.updateDailyMetrics({ consecutiveLosses: 5 });
      const circuit = rm.checkCircuitBreaker({
        maxConsecutiveLosses: 3,
      });
      expect(circuit.triggered).toBe(true);
      expect(circuit.level).toBe(2);
    });

    test('should trigger on max drawdown', () => {
      rm.updateDailyMetrics({
        peakBalance: 10000,
        currentBalance: 8500,
      });
      const circuit = rm.checkCircuitBreaker({
        maxDrawdownThreshold: 0.2, // 20%
      });
      expect(circuit.triggered).toBe(true);
      expect(circuit.level).toBe(3);
    });

    test('should not trigger when thresholds not exceeded', () => {
      rm.updateDailyMetrics({
        dailyPnL: -500,
        startOfDayBalance: 10000,
        consecutiveLosses: 2,
        peakBalance: 10000,
        currentBalance: 9800,
      });
      const circuit = rm.checkCircuitBreaker({
        dailyLossThreshold: 0.1,
        maxConsecutiveLosses: 3,
        maxDrawdownThreshold: 0.2,
      });
      expect(circuit.triggered).toBe(false);
    });
  });

  describe('recordTradeResult', () => {
    test('should increment consecutive losses on negative PnL', () => {
      rm.reset();
      rm.recordTradeResult(-100);
      rm.recordTradeResult(-50);
      
      const state = rm.getDailyMetrics();
      expect(state.consecutiveLosses).toBe(2);
    });

    test('should reset consecutive losses on win', () => {
      rm.reset();
      rm.recordTradeResult(-100);
      rm.recordTradeResult(200);
      
      const state = rm.getDailyMetrics();
      expect(state.consecutiveLosses).toBe(0);
    });

    test('should accumulate daily PnL', () => {
      rm.reset();
      rm.updateDailyMetrics({ dailyPnL: 0, startOfDayBalance: 10000 });
      rm.recordTradeResult(100);
      rm.recordTradeResult(50);
      
      const state = rm.getDailyMetrics();
      expect(state.dailyPnL).toBe(150);
    });
  });
});
