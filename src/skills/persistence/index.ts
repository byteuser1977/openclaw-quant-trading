/**
 * Persistence Skill - 数据持久化层
 * 
 * 将交易记录、绩效指标、风险告警写入飞书多维表格 (Bitable)
 * 
 * 配置的表格:
 * - 交易记录: tblFgMYmwl1mvRt8
 * - 绩效指标: tblQ0zgTAM5Gx93z
 * - 警报历史: tblBGFCTgZ16sIbB
 * 
 * ⚠️ 注意: 字段名称需要与 Bitable 表字段一一对应。
 */

// 声明内置 Feishu 工具函数 (运行时注入)
// Feishu Bitable App Table Record tool (injected at runtime). Use global if available; otherwise throw for safety.
const feishu_bitable_app_table_record = (global as any).feishu_bitable_app_table_record as ((params:any) => Promise<any>) || (() => {
  throw new Error('feishu_bitable_app_table_record is not available');
});

// 飞书 Bitable App Token
const BITABLE_APP_TOKEN = 'TyRsbT7uyaFSydsgGPQcnFDlneg';

// 数据表 ID
const TABLE_IDS = {
  trade: 'tblFgMYmwl1mvRt8',
  performance: 'tblQ0zgTAM5Gx93z',
  alert: 'tblBGFCTgZ16sIbB',
} as const;

/**
 * 交易记录接口
 */
export interface TradeRecord {
  // 必需字段
  timestamp: number;          // 交易时间戳 (毫秒)
  symbol: string;             // 交易对 (e.g., "BTC/USDT")
  side: 'BUY' | 'SELL';       // 买卖方向
  price: number;              // 成交价格
  quantity: number;           // 成交数量
  orderId?: string;           // 订单 ID (可选)
  strategyName?: string;      // 策略名称 (可选)
  pnl?: number;               // 盈亏金额 (可选，用于平仓后)
  fee?: number;               // 手续费 (可选)
}

/**
 * 绩效指标接口
 */
export interface PerformanceMetric {
  timestamp: number;          // 统计周期结束时间
  strategyName: string;       // 策略名称
  totalTrades: number;        // 总交易次数
  winRate: number;            // 胜率 (0-1)
  avgPnL: number;             // 平均盈亏
  avgWin: number;             // 平均盈利
  avgLoss: number;            // 平均亏损
  profitFactor: number;       // 盈亏比 (总盈利/总亏损)
  sharpeRatio?: number;       // 夏普比率 (可选)
  maxDrawdown: number;        // 最大回撤 (0-1)
  totalReturn: number;        // 累计收益率 (0-1)
  startBalance: number;       // 期初余额
  endBalance: number;         // 期末余额
}

/**
 * 风险告警接口
 */
export interface RiskAlert {
  timestamp: number;          // 告警时间
  level: 'info' | 'warning' | 'critical'; // 告警级别
  type: string;               // 告警类型 (e.g., "circuit_breaker")
  message: string;            // 告警描述
  details?: Record<string, any>; // 附加详情
}

/**
 * 持久化管理器
 */
export class PersistenceManager {
  /**
   * 保存一笔交易记录
   */
  async saveTrade(record: TradeRecord): Promise<string> {
    try {
      const res = await feishu_bitable_app_table_record({
        action: 'create',
        app_token: BITABLE_APP_TOKEN,
        table_id: TABLE_IDS.trade,
        fields: {
          交易时间: record.timestamp,
          交易对: record.symbol,
          方向: record.side,
          价格: record.price,
          数量: record.quantity,
          订单ID: record.orderId,
          策略名称: record.strategyName,
          盈亏: record.pnl,
          手续费: record.fee,
        },
      });

      const recordId = res.data?.records?.[0]?.record_id;
      return recordId;
    } catch (error: any) {
      console.error('[Persistence] Failed to save trade:', error);
      throw error;
    }
  }

  /**
   * 批量保存交易记录
   */
  async batchSaveTrades(records: TradeRecord[]): Promise<string[]> {
    try {
      const res = await feishu_bitable_app_table_record({
        action: 'batch_create',
        app_token: BITABLE_APP_TOKEN,
        table_id: TABLE_IDS.trade,
        records: records.map(r => ({
          fields: {
            交易时间: r.timestamp,
            交易对: r.symbol,
            方向: r.side,
            价格: r.price,
            数量: r.quantity,
            订单ID: r.orderId,
            策略名称: r.strategyName,
            盈亏: r.pnl,
            手续费: r.fee,
          },
        })),
      });

      const ids = res.data?.records?.map((r: any) => r.record_id) || [];
      return ids;
    } catch (error: any) {
      console.error('[Persistence] Failed to batch save trades:', error);
      throw error;
    }
  }

  /**
   * 查询交易记录 (分页)
   */
  async listTrades(options?: {
    pageSize?: number;
    pageToken?: string;
    filter?: {
      field: string;
      operator: 'is' | 'isNot' | 'contains' | 'isEmpty' | 'isNotEmpty';
      value?: any;
    }[];
  }): Promise<{ records: TradeRecord[]; nextPageToken?: string }> {
    const params: any = {
      action: 'list',
      app_token: BITABLE_APP_TOKEN,
      table_id: TABLE_IDS.trade,
      page_size: options?.pageSize || 20,
    };
    
    if (options?.pageToken) {
      params.page_token = options.pageToken;
    }

    // Feishu filter format: conjunction + conditions
    if (options?.filter && options.filter.length > 0) {
      params.filter = {
        conjunction: 'and',
        conditions: options.filter.map(f => ({
          field_name: f.field,
          operator: f.operator,
          value: f.value !== undefined ? [f.value] : undefined,
        })),
      };
    }

    const res = await feishu_bitable_app_table_record(params);
    const records = (res.data?.records || []).map((r: any) => ({
      timestamp: r.fields.交易时间,
      symbol: r.fields.交易对,
      side: r.fields.方向,
      price: r.fields.价格,
      quantity: r.fields.数量,
      orderId: r.fields.订单ID,
      strategyName: r.fields.策略名称,
      pnl: r.fields.盈亏,
      fee: r.fields.手续费,
    }));

    return {
      records,
      nextPageToken: res.data?.page_token,
    };
  }

  /**
   * 保存绩效指标
   */
  async savePerformance(metric: PerformanceMetric): Promise<string> {
    try {
      const res = await feishu_bitable_app_table_record({
        action: 'create',
        app_token: BITABLE_APP_TOKEN,
        table_id: TABLE_IDS.performance,
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

      const recordId = res.data?.records?.[0]?.record_id;
      return recordId;
    } catch (error: any) {
      console.error('[Persistence] Failed to save performance metric:', error);
      throw error;
    }
  }

  /**
   * 保存风险告警
   */
  async saveAlert(alert: RiskAlert): Promise<string> {
    try {
      const res = await feishu_bitable_app_table_record({
        action: 'create',
        app_token: BITABLE_APP_TOKEN,
        table_id: TABLE_IDS.alert,
        fields: {
          告警时间: alert.timestamp,
          级别: alert.level,
          类型: alert.type,
          消息: alert.message,
          详情: JSON.stringify(alert.details || {}),
        },
      });

      const recordId = res.data?.records?.[0]?.record_id;
      return recordId;
    } catch (error: any) {
      console.error('[Persistence] Failed to save risk alert:', error);
      throw error;
    }
  }

  /**
   * 批量保存风险告警
   */
  async batchSaveAlerts(alerts: RiskAlert[]): Promise<string[]> {
    try {
      const res = await feishu_bitable_app_table_record({
        action: 'batch_create',
        app_token: BITABLE_APP_TOKEN,
        table_id: TABLE_IDS.alert,
        records: alerts.map(a => ({
          fields: {
            告警时间: a.timestamp,
            级别: a.level,
            类型: a.type,
            消息: a.message,
            详情: JSON.stringify(a.details || {}),
          },
        })),
      });

      const ids = res.data?.records?.map((r: any) => r.record_id) || [];
      return ids;
    } catch (error: any) {
      console.error('[Persistence] Failed to batch save alerts:', error);
      throw error;
    }
  }
}

// 导出单例
let globalPersistence: PersistenceManager | null = null;

export function getPersistence(): PersistenceManager {
  if (!globalPersistence) {
    globalPersistence = new PersistenceManager();
  }
  return globalPersistence;
}
