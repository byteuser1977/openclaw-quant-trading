/**
 * Persistence Manager Unit Tests
 * 
 * 使用 Jest mock 模拟 feishu_bitable_app_table_record 调用
 */

// Mock 飞书 API
const mockFeishuBitableRecord = jest.fn();

// 声明全局注入 (与实际运行时一致)
declare const feishu_bitable_app_table_record: typeof mockFeishuBitableRecord;

import { getPersistence, PersistenceManager, TradeRecord, PerformanceMetric, RiskAlert } from '@/skills/persistence';

describe('PersistenceManager', () => {
  let persistence: PersistenceManager;

  beforeEach(() => {
    mockFeishuBitableRecord.mockClear();
    persistence = getPersistence();
  });

  describe('saveTrade', () => {
    const trade: TradeRecord = {
      timestamp: 1700000000000,
      symbol: 'BTC/USDT',
      side: 'BUY',
      price: 50000,
      quantity: 1,
      orderId: 'order_123',
      strategyName: 'TestStrategy',
      pnl: 100,
      fee: 10,
    };

    test('should call feishu API with correct fields', async () => {
      mockFeishuBitableRecord.mockResolvedValue({
        data: { records: [{ record_id: 'rec_123' }] },
      });

      const recordId = await persistence.saveTrade(trade);

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith({
        action: 'create',
        app_token: 'TyRsbT7uyaFSydsgGPQcnFDlneg',
        table_id: 'tblFgMYmwl1mvRt8',
        fields: {
          交易时间: trade.timestamp,
          交易对: trade.symbol,
          方向: trade.side,
          价格: trade.price,
          数量: trade.quantity,
          订单ID: trade.orderId,
          策略名称: trade.strategyName,
          盈亏: trade.pnl,
          手续费: trade.fee,
        },
      });
      expect(recordId).toBe('rec_123');
    });

    test('should handle API errors gracefully', async () => {
      mockFeishuBitableRecord.mockRejectedValue(new Error('API Error'));

      await expect(persistence.saveTrade(trade)).rejects.toThrow('API Error');
    });
  });

  describe('batchSaveTrades', () => {
    const trades: TradeRecord[] = [
      { timestamp: 1, symbol: 'BTC/USDT', side: 'BUY', price: 100, quantity: 1 },
      { timestamp: 2, symbol: 'BTC/USDT', side: 'SELL', price: 110, quantity: 1 },
    ];

    test('should batch create trades', async () => {
      mockFeishuBitableRecord.mockResolvedValue({
        data: { records: [{ record_id: 'rec_1' }, { record_id: 'rec_2' }] },
      });

      const ids = await persistence.batchSaveTrades(trades);

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith({
        action: 'batch_create',
        app_token: 'TyRsbT7uyaFSydsgGPQcnFDlneg',
        table_id: 'tblFgMYmwl1mvRt8',
        records: trades.map(t => ({
          fields: {
            交易时间: t.timestamp,
            交易对: t.symbol,
            方向: t.side,
            价格: t.price,
            数量: t.quantity,
            订单ID: undefined,
            策略名称: undefined,
            盈亏: undefined,
            手续费: undefined,
          },
        })),
      });
      expect(ids).toEqual(['rec_1', 'rec_2']);
    });
  });

  describe('listTrades', () => {
    test('should list trades with pagination', async () => {
      mockFeishuBitableRecord.mockResolvedValue({
        data: {
          records: [
            {
              fields: {
                交易时间: 1700000000000,
                交易对: 'BTC/USDT',
                方向: 'BUY',
                价格: 50000,
                数量: 1,
                订单ID: 'order_1',
                策略名称: 'Test',
                盈亏: 100,
                手续费: 10,
              },
            },
          ],
          page_token: 'next_page',
        },
      });

      const result = await persistence.listTrades({ pageSize: 10 });

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith({
        action: 'list',
        app_token: 'TyRsbT7uyaFSydsgGPQcnFDlneg',
        table_id: 'tblFgMYmwl1mvRt8',
        page_size: 10,
      });
      expect(result.records.length).toBe(1);
      expect(result.records[0].symbol).toBe('BTC/USDT');
      expect(result.nextPageToken).toBe('next_page');
    });

    test('should apply filters correctly', async () => {
      mockFeishuBitableRecord.mockResolvedValue({ data: { records: [] } });

      await persistence.listTrades({
        filter: [
          { field: '交易对', operator: 'is', value: 'BTC/USDT' },
        ],
      });

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: {
            conjunction: 'and',
            conditions: [
              { field_name: '交易对', operator: 'is', value: ['BTC/USDT'] },
            ],
          },
        })
      );
    });
  });

  describe('savePerformance', () => {
    const metric: PerformanceMetric = {
      timestamp: 1700000000000,
      strategyName: 'TestStrategy',
      totalTrades: 100,
      winRate: 0.65,
      avgPnL: 150.5,
      avgWin: 300,
      avgLoss: -150,
      profitFactor: 2.0,
      maxDrawdown: 0.15,
      totalReturn: 0.25,
      startBalance: 10000,
      endBalance: 12500,
    };

    test('should save performance metric', async () => {
      mockFeishuBitableRecord.mockResolvedValue({
        data: { records: [{ record_id: 'perf_123' }] },
      });

      const recordId = await persistence.savePerformance(metric);

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith({
        action: 'create',
        app_token: 'TyRsbT7uyaFSydsgGPQcnFDlneg',
        table_id: 'tblQ0zgTAM5Gx93z',
        fields: {
          统计时间: metric.timestamp,
          策略名称: metric.strategyName,
          总交易数: metric.totalTrades,
          胜率: metric.winRate,
          平均盈亏: metric.avgPnL,
          平均盈利: metric.avgWin,
          平均亏损: metric.avgLoss,
          盈亏比: metric.profitFactor,
          夏普比率: metric.sharpeRatio,
          最大回撤: metric.maxDrawdown,
          累计收益: metric.totalReturn,
          期初余额: metric.startBalance,
          期末余额: metric.endBalance,
        },
      });
      expect(recordId).toBe('perf_123');
    });
  });

  describe('saveAlert / batchSaveAlerts', () => {
    const alert: RiskAlert = {
      timestamp: 1700000000000,
      level: 'warning',
      type: 'circuit_breaker',
      message: 'Daily loss threshold exceeded',
      details: { threshold: 0.1, currentLoss: 0.12 },
    };

    test('should save single alert', async () => {
      mockFeishuBitableRecord.mockResolvedValue({
        data: { records: [{ record_id: 'alert_123' }] },
      });

      const recordId = await persistence.saveAlert(alert);

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith({
        action: 'create',
        app_token: 'TyRsbT7uyaFSydsgGPQcnFDlneg',
        table_id: 'tblBGFCTgZ16sIbB',
        fields: {
          告警时间: alert.timestamp,
          级别: alert.level,
          类型: alert.type,
          消息: alert.message,
          详情: JSON.stringify(alert.details),
        },
      });
      expect(recordId).toBe('alert_123');
    });

    test('should batch save alerts', async () => {
      const alerts: RiskAlert[] = [alert, { ...alert, level: 'info' }];
      mockFeishuBitableRecord.mockResolvedValue({
        data: { records: [{ record_id: 'a1' }, { record_id: 'a2' }] },
      });

      const ids = await persistence.batchSaveAlerts(alerts);

      expect(mockFeishuBitableRecord).toHaveBeenCalledWith({
        action: 'batch_create',
        app_token: 'TyRsbT7uyaFSydsgGPQcnFDlneg',
        table_id: 'tblBGFCTgZ16sIbB',
        records: alerts.map(a => ({
          fields: {
            告警时间: a.timestamp,
            级别: a.level,
            类型: a.type,
            消息: a.message,
            详情: JSON.stringify(a.details),
          },
        })),
      });
      expect(ids).toEqual(['a1', 'a2']);
    });
  });
});
