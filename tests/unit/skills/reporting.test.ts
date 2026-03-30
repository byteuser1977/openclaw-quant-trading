// Mock PersistenceManager
const mockPersistenceListTrades = jest.fn();

import { getReporting, ReportingManager } from '@/skills/reporting';
import { TradeRecord } from '@/skills/persistence';

describe('ReportingManager', () => {
  let reporting: ReportingManager;

  beforeEach(() => {
    mockPersistenceListTrades.mockClear();
    reporting = getReporting() as any;
  });

  describe('calculateStats', () => {
    test('should return zero stats for empty trades', () => {
      const stats = reporting.calculateStats([]);
      expect(stats.totalTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.profitFactor).toBe(0);
      expect(stats.maxDrawdown).toBe(0);
    });

    test('should compute stats for mixed trades', () => {
      const trades: TradeRecord[] = [
        { timestamp: 1, symbol: 'A', side: 'BUY', price: 100, quantity: 1, pnl: 100 },
        { timestamp: 2, symbol: 'A', side: 'BUY', price: 200, quantity: 1, pnl: -50 },
        { timestamp: 3, symbol: 'A', side: 'BUY', price: 300, quantity: 1, pnl: 150 },
      ];

      const stats = reporting.calculateStats(trades);
      expect(stats.totalTrades).toBe(3);
      expect(stats.winningTrades).toBe(2);
      expect(stats.losingTrades).toBe(1);
      expect(stats.winRate).toBeCloseTo(2/3, 2);
      expect(stats.totalPnL).toBe(200); // 100 + 150 - 50
      expect(stats.avgPnL).toBeCloseTo(200/3, 2);
      expect(stats.profitFactor).toBeCloseTo((100+150)/50, 2); // 5
    });

    test('should handle all winning trades', () => {
      const trades: TradeRecord[] = [
        { timestamp: 1, symbol: 'A', side: 'BUY', price: 100, quantity: 1, pnl: 50 },
        { timestamp: 2, symbol: 'A', side: 'BUY', price: 200, quantity: 1, pnl: 100 },
      ];

      const stats = reporting.calculateStats(trades);
      expect(stats.losingTrades).toBe(0);
      expect(stats.avgLoss).toBe(0);
      expect(stats.profitFactor).toBe(Infinity);
    });

    test('should handle all losing trades', () => {
      const trades: TradeRecord[] = [
        { timestamp: 1, symbol: 'A', side: 'BUY', price: 100, quantity: 1, pnl: -30 },
        { timestamp: 2, symbol: 'A', side: 'BUY', price: 200, quantity: 1, pnl: -70 },
      ];

      const stats = reporting.calculateStats(trades);
      expect(stats.winningTrades).toBe(0);
      expect(stats.avgWin).toBe(0);
      expect(stats.profitFactor).toBe(0);
    });

    test('should filter out trades without pnl', () => {
      const trades: TradeRecord[] = [
        { timestamp: 1, symbol: 'A', side: 'BUY', price: 100, quantity: 1 }, // no pnl
        { timestamp: 2, symbol: 'A', side: 'BUY', price: 200, quantity: 1, pnl: 100 },
      ];

      const stats = reporting.calculateStats(trades);
      expect(stats.totalTrades).toBe(1);
      expect(stats.totalPnL).toBe(100);
    });

    test('should compute max drawdown from cumulative PnL', () => {
      // Create sequence: +100, -20, -30, +80, +100, -150
      // Cumulative: 100, 80, 50, 130, 230, 80
      // Peak: 230, maxDD = (230-80)/230 = 150/230 ≈ 0.652
      const trades: TradeRecord[] = [
        { timestamp: 1, symbol: 'A', side: 'BUY', price: 100, quantity: 1, pnl: 100 },
        { timestamp: 2, symbol: 'A', side: 'BUY', price: 110, quantity: 1, pnl: -20 },
        { timestamp: 3, symbol: 'A', side: 'BUY', price: 120, quantity: 1, pnl: -30 },
        { timestamp: 4, symbol: 'A', side: 'BUY', price: 130, quantity: 1, pnl: 80 },
        { timestamp: 5, symbol: 'A', side: 'BUY', price: 140, quantity: 1, pnl: 100 },
        { timestamp: 6, symbol: 'A', side: 'BUY', price: 150, quantity: 1, pnl: -150 },
      ];

      const stats = reporting.calculateStats(trades);
      // Remove the expected value... recalc:
      // Cumulative: 100, 80, 50, 130, 230, 80
      // Peak progression: 100 -> 100 -> 100 -> 130 -> 230 -> 230
      // Drawdowns: 0, (100-80)/100=0.2, (100-50)/100=0.5, (130-130)=0, (230-230)=0, (230-80)/230≈0.652
      expect(stats.maxDrawdown).toBeCloseTo(0.652, 3);
    });
  });

  describe('generateMarkdownReport', () => {
    const mockTrades: TradeRecord[] = [
      { timestamp: 1700000000000, symbol: 'BTC/USDT', side: 'BUY', price: 50000, quantity: 1, pnl: 100 },
      { timestamp: 1700003600000, symbol: 'BTC/USDT', side: 'SELL', price: 51000, quantity: 1, pnl: 800 },
    ];

    test('should generate basic markdown with summary', () => {
      const md = reporting.generateMarkdownReport(mockTrades);
      expect(md).toContain('# 交易报告');
      expect(md).toContain('总交易次数');
      expect(md).toContain('胜率');
      expect(md).toContain('盈亏比');
    });

    test('should include trade list when requested', () => {
      const md = reporting.generateMarkdownReport(mockTrades, { format: 'markdown', includeTradeList: true });
      expect(md).toContain('交易明细');
      expect(md).toContain('BTC/USDT');
    });

    test('should respect maxTrades limit', () => {
      const manyTrades: TradeRecord[] = Array.from({ length: 10 }, (_, i) => ({
        timestamp: 1700000000000 + i * 3600 * 1000,
        symbol: 'BTC/USDT',
        side: i % 2 === 0 ? 'BUY' : 'SELL',
        price: 50000 + i * 100,
        quantity: 1,
        pnl: i * 10,
      }));

      const md = reporting.generateMarkdownReport(manyTrades, { format: 'markdown', includeTradeList: true, maxTrades: 3 });
      // Count lines with '| 时间 |' to find trades rows count. Actually rows are after header.
      const rows = md.split('\n').filter(line => line.startsWith('| ') && line.includes('|') && !line.includes('---'));
      // The rows include the header line and separators and trade rows.
      // Count trade rows: we have header line and separator line; then each trade row is like '| date | ...'
      const tradeRows = rows.filter(line => line.includes('BTC/USDT'));
      expect(tradeRows.length).toBe(3);
    });

    test('should handle missing optional fields gracefully', () => {
      const trade: TradeRecord = {
        timestamp: 1700000000000,
        symbol: 'BTC/USDT',
        side: 'BUY',
        price: 50000,
        quantity: 1,
        // pnl, orderId, strategyName, fee are undefined
      };
      const md = reporting.generateMarkdownReport([trade], { format: 'markdown', includeTradeList: true });
      expect(md).toContain('BTC/USDT');
    });
  });

  describe('generateCSV', () => {
    const mockTrades: TradeRecord[] = [
      { timestamp: 1700000000000, symbol: 'BTC/USDT', side: 'BUY', price: 50000, quantity: 1, pnl: 100 },
    ];

    test('should include all headers', () => {
      const csv = reporting.generateCSV(mockTrades);
      // Headers are unquoted, data rows quoted
      expect(csv).toContain('timestamp');
      expect(csv).toContain('symbol');
      expect(csv).toContain('side');
      expect(csv).toContain('price');
      expect(csv).toContain('quantity');
      expect(csv).toContain('pnl');
      expect(csv).toContain('fee');
    });

    test('should handle empty trades', () => {
      const csv = reporting.generateCSV([]);
      expect(csv).toBe('timestamp,symbol,side,price,quantity,orderId,strategyName,pnl,fee');
    });

    test('should quote all values', () => {
      const csv = reporting.generateCSV(mockTrades);
      // Each field should be quoted
      expect(csv).toContain('"1700000000000"');
      expect(csv).toContain('"BTC/USDT"');
      expect(csv).toContain('"BUY"');
    });
  });
});
