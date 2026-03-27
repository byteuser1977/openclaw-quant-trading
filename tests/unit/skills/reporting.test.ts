import { getReporting, ReportingManager } from '@/skills/reporting';
import { TradeRecord } from '@/skills/persistence';

/**
 * Reporting 模块单元测试
 * 注意：实际运行需要 mocking feishu 环境，此处仅测试纯统计计算
 */
describe('ReportingManager', () => {
  let reporting: ReportingManager;

  beforeAll(() => {
    reporting = getReporting();
  });

  const mockTrades: TradeRecord[] = [
    {
      timestamp: 1700000000000,
      symbol: 'BTC/USDT',
      side: 'BUY',
      price: 50000,
      quantity: 1,
      pnl: 1000,
    },
    {
      timestamp: 1700001000000,
      symbol: 'BTC/USDT',
      side: 'SELL',
      price: 51000,
      quantity: 1,
      pnl: 1000,
    },
    {
      timestamp: 1700002000000,
      symbol: 'ETH/USDT',
      side: 'BUY',
      price: 3000,
      quantity: 2,
      pnl: -500,
    },
  ];

  test('calculateStats works with basic trades', () => {
    const stats = reporting.calculateStats(mockTrades);
    expect(stats.totalTrades).toBe(3);
    expect(stats.winningTrades).toBe(2);
    expect(stats.losingTrades).toBe(1);
    expect(stats.winRate).toBeCloseTo(2 / 3, 2);
    expect(stats.totalPnL).toBe(1500); // 1000 + 1000 - 500
  });

  test('generateMarkdownReport contains summary table', () => {
    const md = reporting.generateMarkdownReport(mockTrades);
    expect(md).toContain('交易报告');
    expect(md).toContain('统计摘要');
    expect(md).toContain('总交易次数');
    expect(md).toContain('胜率');
  });

  test('generateCSV produces valid CSV with headers', () => {
    const csv = reporting.generateCSV(mockTrades);
    const lines = csv.split('\n');
    expect(lines[0]).toContain('timestamp');
    expect(lines[0]).toContain('symbol');
    expect(lines[0]).toContain('pnl');
    expect(lines.length).toBe(4); // header + 3 data rows
  });

  test('empty trades returns zero stats', () => {
    const stats = reporting.calculateStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.totalPnL).toBe(0);
  });
});
