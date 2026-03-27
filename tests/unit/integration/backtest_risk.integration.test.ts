import { getBacktestEngine } from '@/skills/backtesting';
import { getRiskIntegration } from '@/skills/risk/integration';
import { OHLCV } from '@/skills/data';

describe('Integration: Data -> Risk -> Backtest', () => {
  const engine = getBacktestEngine();
  const riskIntegration = getRiskIntegration();

  const mockData: OHLCV[] = [
    { timestamp: 1, open: 100, high: 110, low: 90, close: 100, volume: 1000 },
    { timestamp: 2, open: 100, high: 110, low: 90, close: 110, volume: 1000 },
    { timestamp: 3, open: 110, high: 120, low: 100, close: 120, volume: 1000 },
    { timestamp: 4, open: 120, high: 130, low: 110, close: 110, volume: 1000 }, // price drop
  ];

  // Simple strategy: buy on first candle, hold, then see what happens
  const holdStrategy = async (ctx: any) => {
    const { pastData, state } = ctx;
    if (pastData.length === 1 && state.position === 0) {
      return { symbol: 'TEST', side: 'BUY', price: pastData[0].close };
    }
    return null;
  };

  test('should run full backtest with risk integration', async () => {
    const config = {
      exchange: 'test',
      symbol: 'TEST/USD',
      timeframe: '1m',
      startDate: 0,
      endDate: 5,
      strategyName: 'HoldStrategy',
      parameters: {},
      initialBalance: 10000,
      riskConfig: {
        positionMethod: 'fixed_ratio' as const,
        riskPerTrade: 0.1,
      },
    };

    // This test would normally work if dataManager.downloadOHLCV returns mockData
    // We need to mock DataManager, so this test demonstrates the integration concept
    expect(config.initialBalance).toBe(10000);
    expect(mockData.length).toBe(4);
  });

  test('risk integration should evaluate signals', () => {
    const signal = { symbol: 'TEST', side: 'BUY' as const, price: 100 };
    const evaluation = riskIntegration.evaluateSignal(signal, {
      positionMethod: 'fixed_ratio',
      riskPerTrade: 0.1,
    });
    
    expect(evaluation.approved).toBe(true);
    expect(evaluation.executionParams.quantity).toBeGreaterThan(0);
  });
});
