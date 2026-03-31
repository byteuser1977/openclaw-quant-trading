import { getDataManager, DataManager, OHLCV } from '@/skills/data';
import { getRiskManager } from '@/skills/risk';
import { initVault } from '@/core/vault';

// Set dummy master key for tests
process.env.OPENCLAW_QUANT_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * Simple mock data for validation tests
 */
const mockData: OHLCV[] = [
  { timestamp: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
  { timestamp: 2000, open: 11, high: 13, low: 10, close: 12, volume: 150 },
  // Duplicate timestamp
  { timestamp: 2000, open: 11, high: 13, low: 10, close: 12, volume: 150 },
  // Invalid high < low
  { timestamp: 3000, open: 12, high: 8, low: 9, close: 10, volume: 200 },
  // Missing open
  { timestamp: 4000, open: null as any, high: 14, low: 13, close: 13, volume: 120 },
];

describe('DataManager validation & cleaning', () => {
  let manager: DataManager;

  beforeAll(async () => {
    await initVault(); // Initialize vault singleton
    manager = getDataManager();
  });

  test('validateData detects issues', () => {
    const result = manager.validateData(mockData);
    expect(result.invalidRecords).toBeGreaterThan(0);
    expect(result.issues.some(i => i.type === 'duplicate')).toBeTruthy();
    expect(result.issues.some(i => i.type === 'invalid')).toBeTruthy();
    expect(result.issues.some(i => i.type === 'missing')).toBeTruthy();
  });

  test('cleanData removes duplicates and invalid rows', () => {
    const cleaned = manager.cleanData(mockData);
    // Should keep only valid rows (timestamp 1000 and 2000 unique)
    expect(cleaned.length).toBe(2);
    expect(cleaned[0].timestamp).toBe(1000);
    expect(cleaned[1].timestamp).toBe(2000);
  });
});

describe('RiskManager position sizing', () => {
  let risk: any;

  beforeAll(async () => {
    await initVault(); // Ensure vault is ready
    risk = getRiskManager();
  });

  test('fixed ratio calculation', () => {
    const result = risk.calculateFixedRatio({
      balance: 10000,
      riskPerTrade: 0.02,
      entryPrice: 50,
      stoplossPct: 0.1,
    });
    expect(result.positionSize).toBeCloseTo(40); // 2% of 10k = 200, stoploss 10% => 2000 value /50 = 40 units
  });

  test('kelly calculation returns positive position', () => {
    const result = risk.calculateKelly({
      balance: 10000,
      entryPrice: 100,
      winRate: 0.55,
      avgWin: 200,
      avgLoss: 100,
      kellyFraction: 0.5,
    });
    expect(result.positionSize).toBeGreaterThan(0);
  });
});
