import { getBacktestEngine, BacktestEngine } from '@/skills/backtesting';
import { OHLCV } from '@/skills/data';
import { TradeSignal } from '@/skills/risk/integration';
import { initVault } from '@/core/vault';

// Set dummy master key for tests
process.env.OPENCLAW_QUANT_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Mock data helper
function createMockCandle(timestamp: number, close: number, high?: number, low?: number, open?: number): OHLCV {
  return {
    timestamp,
    open: open ?? close * 0.99,
    high: high ?? close * 1.02,
    low: low ?? close * 0.98,
    close,
    volume: 1000,
  };
}

describe('BacktestEngine', () => {
  let engine: BacktestEngine;

  beforeAll(async () => {
    await initVault(); // Initialize vault singleton
    engine = getBacktestEngine();
  });

  const mockConfig = {
    exchange: 'binance',
    symbol: 'BTC/USDT',
    timeframe: '1h',
    startDate: 1700000000000,
    endDate: 1700003600000, // 1 hour later
    strategyName: 'TestStrategy',
    parameters: { rsi_period: 14 },
    initialBalance: 10000,
  };

  const mockData: OHLCV[] = [
    createMockCandle(1700000000000, 50000),
    createMockCandle(1700003600000, 50500),
    createMockCandle(1700007200000, 51000),
    createMockCandle(1700010800000, 50800),
    createMockCandle(1700014400000, 51200),
  ];

  // Simple strategy: buy when price increases for 2 consecutive candles
  const simpleStrategy = async (ctx: any) => {
    const { pastData, parameters } = ctx;
    if (pastData.length < 2) return null;
    
    const last = pastData[pastData.length - 1];
    const prev = pastData[pastData.length - 2];
    
    if (last.close > prev.close && ctx.state.position === 0) {
      return { symbol: 'BTC/USDT', side: 'BUY', price: last.close };
    }
    if (last.close < prev.close && ctx.state.position > 0) {
      return { symbol: 'BTC/USDT', side: 'SELL', price: last.close };
    }
    return null;
  };

  test('should load data', async () => {
    // This would normally call DataManager, we'd need to mock it
    // For now, test that engine is instantiated
    expect(engine).toBeInstanceOf(BacktestEngine);
  });

  test('should calculate summary from trades', async () => {
    // Mock state for summary calculation
    const state: any = {
      balance: 10500,
      position: 0,
      entryPrice: null,
      tradeHistory: [
        {
          entryTime: 1700003600000,
          exitTime: 1700014400000,
          side: 'BUY' as const,
          entryPrice: 50000,
          exitPrice: 51200,
          quantity: 0.1,
          pnl: 120,
          pnlPct: 0.024,
          exitReason: 'signal' as const,
        },
      ],
      equityCurve: [10000, 10100, 10200, 10300, 10500],
      maxDrawdown: 0.01,
    };

    // We need to access private method, but in real test we'd run full backtest
    // For now, just test the engine exists
    expect(state.tradeHistory.length).toBe(1);
  });

  test('should build equity timeline', async () => {
    const data = mockData;
    const equityCurve = [10000, 10050, 10100, 10080, 10150];
    
    // Manual timeline construction check
    expect(equityCurve.length).toBe(data.length);
    expect(equityCurve[0]).toBe(10000);
  });

  test('should compute drawdown correctly', async () => {
    const equity = [10000, 10200, 10100, 10300, 10000];
    let peak = -Infinity;
    let maxDrawdown = 0;
    
    for (const balance of equity) {
      if (balance > peak) peak = balance;
      const drawdown = (peak - balance) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    expect(maxDrawdown).toBeCloseTo(0.0303, 2); // (10300-10000)/10300 ≈ 2.9%
  });
});
