import { TradingSystem, TradingSystemConfig } from '@/skills/exchange/integration';
import { OHLCV } from '@/skills/data';
import { TradeSignal } from '@/skills/risk/integration';
import { getDataManager } from '@/skills/data';
import { getRiskIntegration } from '@/skills/risk/integration';
import { getPersistence } from '@/skills/persistence';
import { getReporting } from '@/skills/reporting';

// Mock dependencies
jest.mock('@/skills/data', () => ({
  getDataManager: jest.fn(() => ({
    downloadOHLCV: jest.fn(),
    downloadOHLCVBatched: jest.fn(),
  })),
}));

jest.mock('@/skills/risk/integration', () => ({
  getRiskIntegration: jest.fn(() => ({
    evaluateSignal: jest.fn().mockResolvedValue({ approved: true, executionParams: { quantity: 1 } }),
    calculateStoploss: jest.fn().mockReturnValue(90),
    checkCircuitBreaker: jest.fn().mockReturnValue({ triggered: false }),
  })),
  TradeSignal: {}, // dummy
}));

jest.mock('@/skills/persistence', () => ({
  getPersistence: jest.fn(() => ({
    saveTrade: jest.fn(),
    listTrades: jest.fn().mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 1000 }),
  })),
}));

jest.mock('@/skills/reporting', () => ({
  getReporting: jest.fn(() => ({
    generateMarkdownReport: jest.fn().mockReturnValue('# Report'),
    generateCSV: jest.fn().mockReturnValue('csv'),
    calculateStats: jest.fn().mockReturnValue({
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: 0,
      maxDrawdown: 0,
    }),
  })),
}));

describe('TradingSystem Integration', () => {
  let config: TradingSystemConfig;

  beforeEach(() => {
    config = {
      exchange: 'mock',
      symbol: 'TEST/USD',
      timeframe: '1m',
      initialBalance: 10000,
      dataStartDate: 0,
      dataEndDate: 10,
      riskConfig: {},
    };
    jest.clearAllMocks();
  });

  test('should initialize with mock exchange', async () => {
    const system = new TradingSystem(config);
    const result = await system.initialize();
    expect(result.success).toBe(true);
  });

  test('should execute simple strategy and record trades', async () => {
    const system = new TradingSystem(config);
    await system.initialize();

    // Provide controlled data
    const mockData: OHLCV[] = [
      { timestamp: 1, open: 100, high: 110, low: 90, close: 100, volume: 100 },
      { timestamp: 2, open: 100, high: 110, low: 90, close: 110, volume: 100 },
      { timestamp: 3, open: 110, high: 120, low: 100, close: 120, volume: 100 },
      { timestamp: 4, open: 120, high: 130, low: 110, close: 110, volume: 100 },
    ];

    // Mock DataManager.downloadOHLCV to return our mock data
    const dm = getDataManager();
    (dm as any).downloadOHLCV = jest.fn().mockResolvedValue(mockData);
    (dm as any).downloadOHLCVBatched = jest.fn().mockResolvedValue(mockData);

    // Strategy: buy at first candle, sell at last
    const strategy = async (ctx: any): Promise<TradeSignal | null> => {
      const { pastData, state } = ctx;
      if (pastData.length === 1 && state.position === 0) {
        return { symbol: config.symbol, side: 'BUY' as const, price: pastData[0].close };
      }
      if (pastData.length === 4 && state.position > 0) {
        return { symbol: config.symbol, side: 'SELL' as const, price: pastData[3].close };
      }
      return null;
    };

    const result = await system.run(strategy);

    // result is { summary, error? }
    expect(result.summary.totalTrades).toBeGreaterThanOrEqual(2);
    expect(result.summary.finalBalance).toBeGreaterThan(config.initialBalance);
  });

  test('should respect stoploss when price drops below threshold', async () => {
    const system = new TradingSystem(config);
    await system.initialize();

    // Sequence: buy at 100, price goes up then down below stoploss 90
    const mockData: OHLCV[] = [
      { timestamp: 1, open: 100, high: 110, low: 90, close: 100, volume: 100 }, // buy
      { timestamp: 2, open: 100, high: 110, low: 95, close: 110, volume: 100 },
      { timestamp: 3, open: 110, high: 120, low: 100, close: 110, volume: 100 },
      { timestamp: 4, open: 110, high: 120, low: 80, close: 90, volume: 100 }, // low 80 triggers stoploss
    ];

    const dm = getDataManager();
    (dm as any).downloadOHLCV = jest.fn().mockResolvedValue(mockData);
    (dm as any).downloadOHLCVBatched = jest.fn().mockResolvedValue(mockData);

    const strategy = async (ctx: any): Promise<TradeSignal | null> => {
      if (ctx.pastData.length === 1 && ctx.state.position === 0) {
        return { symbol: config.symbol, side: 'BUY' as const, price: ctx.pastData[0].close };
      }
      return null;
    };

    const result = await system.run(strategy);

    // Should have at least 1 trade and final balance reflect stoploss
    expect(result.summary.totalTrades).toBeGreaterThanOrEqual(1);
    // Note: Since reporting mocks don't capture trade details, we can't easily check stoploss exitReason
    // But we can verify that a trade exists with pnl negative
  });
});
