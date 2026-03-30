import { getDataManager, DataManager } from '@/skills/data';
import { OHLCV } from '@/skills/data';
import { initVault } from '@/core/vault';

// Mock Vault to avoid initialization issues
jest.mock('@/core/vault', () => ({
  initVault: jest.fn().mockResolvedValue(undefined),
  getVault: jest.fn(() => ({
    decrypt: jest.fn().mockResolvedValue('mock_key'),
  })),
}));

describe('DataManager', () => {
  let dm: DataManager;

  beforeAll(async () => {
    await initVault();
    dm = getDataManager();
  });

  describe('validateData', () => {
    const validData: OHLCV[] = [
      { timestamp: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
      { timestamp: 2, open: 105, high: 115, low: 95, close: 110, volume: 1200 },
      { timestamp: 3, open: 110, high: 120, low: 100, close: 115, volume: 1100 },
    ];

    test('should pass validation for clean data', () => {
      const result = dm.validateData(validData);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('should detect duplicate timestamps', () => {
      const dupData = [
        ...validData,
        { timestamp: 2, open: 200, high: 210, low: 190, close: 205, volume: 1000 },
      ];
      const result = dm.validateData(dupData);
      expect(result.valid).toBe(false);
      expect(result.issues.some(e => e.type === 'duplicate')).toBe(true);
    });

    test('should detect missing price values (undefined)', () => {
      const badData = [
        ...validData.slice(0, 1),
        { timestamp: 2, open: undefined as any, high: 115, low: 95, close: 110, volume: 1200 },
      ];
      const result = dm.validateData(badData);
      expect(result.valid).toBe(false);
      expect(result.issues.some(e => e.type === 'missing')).toBe(true);
    });

    test('should detect time gaps (warning)', () => {
      // Create data with consistent 1ms interval, then a large gap of 100ms
      const gapData: OHLCV[] = [];
      for (let i = 0; i < 5; i++) {
        gapData.push({ timestamp: i, open: 100, high: 110, low: 90, close: 105, volume: 1000 });
      }
      // Next timestamp after 4 is 104 (gap of 100)
      gapData.push({ timestamp: 104, open: 105, high: 115, low: 95, close: 110, volume: 1200 });
      const result = dm.validateData(gapData);
      expect(result.valid).toBe(true);
      expect(result.issues.some(e => e.type === 'gap')).toBe(true);
    });

    test('should detect high-low inversion', () => {
      const badData = [
        { timestamp: 1, open: 100, high: 90, low: 110, close: 105, volume: 1000 }, // high < low
      ];
      const result = dm.validateData(badData);
      expect(result.valid).toBe(false);
      expect(result.issues.some(e => e.type === 'invalid')).toBe(true);
    });
  });

  describe('cleanData', () => {
    test('should remove duplicates and sort by timestamp', () => {
      const messyData: OHLCV[] = [
        { timestamp: 3, open: 110, high: 120, low: 100, close: 115, volume: 1100 },
        { timestamp: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 115, low: 95, close: 110, volume: 1200 },
        { timestamp: 2, open: 106, high: 116, low: 96, close: 111, volume: 1300 }, // duplicate timestamp
      ];

      const cleaned = dm.cleanData(messyData);
      
      expect(cleaned.length).toBe(3);
      expect(cleaned[0].timestamp).toBe(1);
      expect(cleaned[1].timestamp).toBe(2);
      expect(cleaned[2].timestamp).toBe(3);
    });

    test('should filter rows with invalid price/volume', () => {
      const badData: OHLCV[] = [
        { timestamp: 1, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 2, open: 105, high: 115, low: 95, close: 0, volume: 1200 }, // close = 0
      ];

      const cleaned = dm.cleanData(badData);
      expect(cleaned.length).toBe(1);
      expect(cleaned[0].timestamp).toBe(1);
    });
  });

  describe('fillGaps', () => {
    test('should fill single missing candle with previous values', () => {
      // Use hourly timestamps (ms) to match interval = 1 hour
      const data: OHLCV[] = [
        { timestamp: 0, open: 100, high: 110, low: 90, close: 105, volume: 1000 },
        { timestamp: 3600000, open: 105, high: 115, low: 95, close: 110, volume: 1200 },
        // Missing timestamp 7200000
        { timestamp: 10800000, open: 110, high: 120, low: 100, close: 115, volume: 1100 },
      ];

      const filled = dm.fillGaps(data, 3600 * 1000); // 1 hour intervals
      
      expect(filled.length).toBe(4);
      // The gap at timestamp 7200000 should be filled with previous close (110)
      const gapCandle = filled.find(c => c.timestamp === 7200000);
      expect(gapCandle).toBeDefined();
      expect(gapCandle!.close).toBe(110);
    });
  });
});
