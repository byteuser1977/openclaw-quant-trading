import { getDataManager, DataManager } from '../data';
import { getRiskIntegration, RiskIntegration } from '../risk/integration';
import { getPersistence } from '../persistence';
import { getReporting } from '../reporting';
import { createBinanceAdapter, ExchangeAdapter } from './adapter';
import { OHLCV } from '../data';
import { TradeSignal } from '../risk/integration';

/**
 * 端到端交易系统集成
 * 
 * 将数据、风险、执行、持久化和报告模块串联起来
 */
export interface TradingSystemConfig {
  exchange: 'binance' | 'mock';
  symbol: string;
  timeframe: string;
  initialBalance: number;
  dataStartDate: number;
  dataEndDate: number;
  riskConfig: any;
  persistenceEnabled?: boolean;
  reportingEnabled?: boolean;
}

export class TradingSystem {
  private dataManager: DataManager;
  private riskIntegration: RiskIntegration;
  private exchangeAdapter: any;
  private persistence: any;
  private reporting: any;
  private config: TradingSystemConfig;

  constructor(config: TradingSystemConfig) {
    this.config = config;
    this.dataManager = getDataManager();
    this.riskIntegration = getRiskIntegration();
    this.persistence = getPersistence();
    this.reporting = getReporting();
  }

  /**
   * 初始化系统：连接交易所，准备数据
   */
  async initialize(): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. 初始化交易所适配器
      if (this.config.exchange === 'binance') {
        this.exchangeAdapter = await createBinanceAdapter();
        const conn = await this.exchangeAdapter.connect();
        if (!conn.connected) {
          return { success: false, error: conn.error };
        }
      } else {
        // Mock adapter for testing
        this.exchangeAdapter = {
          connect: async () => ({ connected: true }),
          createOrder: async (params: any) => ({ orderId: `mock_${Date.now()}` }),
          getBalance: async () => ({ balances: { USDT: this.config.initialBalance } }),
        };
      }

      console.log('[TradingSystem] Initialized successfully');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Init failed' };
    }
  }

  /**
   * 运行完整回测或实盘交易流程
   */
  async run(strategyFunction: (ctx: any) => Promise<TradeSignal | null>): Promise<{ summary: any; error?: string }> {
    try {
      // 2. 下载/加载数据
      console.log('[TradingSystem] Downloading OHLCV data...');
      const ohlcv = await this.dataManager.downloadOHLCV({
        exchange: this.config.exchange === 'mock' ? 'binance' : this.config.exchange,
        symbol: this.config.symbol,
        timeframe: this.config.timeframe,
        since: this.config.dataStartDate,
        endTime: this.config.dataEndDate,
        limit: 1000,
      });

      if (ohlcv.length === 0) {
        return { summary: { error: 'No data available' } };
      }

      // 3. 运行策略逻辑（逐K）
      console.log('[TradingSystem] Running strategy...');
      const result = await this.executeStrategy(ohlcv, strategyFunction);

      // 4. 保存交易记录（如果启用）
      if (this.config.persistenceEnabled !== false) {
        console.log('[TradingSystem] Persisting trades...');
        for (const trade of result.trades) {
          await this.persistence.saveTrade(trade);
        }
      }

      // 5. 生成报告
      let report: string | undefined;
      if (this.config.reportingEnabled !== false) {
        console.log('[TradingSystem] Generating report...');
        report = this.reporting.generateMarkdownReport(result.trades, { includeTradeList: true });
      }

      return {
        summary: {
          totalTrades: result.trades.length,
          finalBalance: result.finalBalance,
          totalPnL: result.trades.reduce((sum, t) => sum + (t.pnl || 0), 0),
          report,
        },
      };
    } catch (error) {
      return { summary: {}, error: error instanceof Error ? error.message : 'Run failed' };
    }
  }

  /**
   * 内部：执行策略循环
   */
  private async executeStrategy(
    ohlcv: OHLCV[],
    strategyFn: (ctx: any) => Promise<TradeSignal | null>
  ): Promise<{ trades: any[]; finalBalance: number }> {
    const trades: any[] = [];
    let balance = this.config.initialBalance;
    let position = 0;
    let entryPrice = 0;
    let entryTime = 0;

    // Trading state context
    const state = {
      position,
      entryPrice: null as number | null,
      entryTime: null as number | null,
      balance,
    };

    // 按时间顺序逐K处理
    for (let i = 0; i < ohlcv.length; i++) {
      const candle = ohlcv[i];
      const pastData = ohlcv.slice(0, i + 1);

      // 调用策略函数
      const signal = await strategyFn({
        pastData,
        state: state,
        currentCandle: candle,
        config: this.config,
      });

      // 处理信号
      if (signal) {
        if (signal.side === 'BUY' && state.position === 0) {
          // 计算仓位（通过风险管理）
          const evaluation = this.riskIntegration.evaluateSignal(signal, this.config.riskConfig);
          if (evaluation.approved) {
            const qty = evaluation.executionParams.quantity;
            entryPrice = signal.price;
            entryTime = candle.timestamp;
            state.position = qty;
            state.entryPrice = signal.price;
            state.entryTime = candle.timestamp;
            balance -= qty * signal.price; // 简单扣除
            console.log(`[TradingSystem] BUY ${qty} @ ${signal.price}`);
          }
        } else if (signal.side === 'SELL' && state.position > 0) {
          // 卖出平仓
          const qty = state.position;
          const pnl = (signal.price - state.entryPrice!) * qty;
          trades.push({
            timestamp: candle.timestamp,
            symbol: signal.symbol,
            side: 'BUY',
            price: state.entryPrice!,
            quantity: qty,
            pnl,
            fee: pnl * 0.001, // mock fee
            strategyName: 'UserStrategy',
            exitTime: candle.timestamp,
            exitPrice: signal.price,
            exitReason: 'signal',
          });
          balance += qty * signal.price;
          state.position = 0;
          state.entryPrice = null;
          state.entryTime = null;
          console.log(`[TradingSystem] SELL ${qty} @ ${signal.price}, PnL: ${pnl}`);
        }
      }

      // 检查止损（通过风险管理）
      if (state.position > 0 && state.entryPrice) {
        const stopPrice = this.riskIntegration.calculateStoploss(
          this.config.riskConfig.stoploss || { type: 'fixed', stoplossPct: 0.1 },
          { side: 'BUY', entryPrice: state.entryPrice, currentPrice: candle.close }
        );
        if (candle.low <= stopPrice) {
          // 触发止损
          const qty = state.position;
          const pnl = (stopPrice - state.entryPrice) * qty;
          trades.push({
            timestamp: candle.timestamp,
            symbol: this.config.symbol,
            side: 'BUY',
            price: state.entryPrice,
            quantity: qty,
            pnl,
            fee: pnl * 0.001,
            strategyName: 'UserStrategy',
            exitTime: candle.timestamp,
            exitPrice: stopPrice,
            exitReason: 'stoploss',
          });
          balance += qty * stopPrice;
          state.position = 0;
          state.entryPrice = null;
          state.entryTime = null;
          console.log(`[TradingSystem] STOPLOSS triggered @ ${stopPrice}, PnL: ${pnl}`);
        }
      }

      // 检查熔断
      const circuit = this.riskIntegration.checkCircuitBreaker(this.config.riskConfig.circuitBreaker || {});
      if (circuit.triggered) {
        console.log(`[TradingSystem] Circuit breaker triggered: ${circuit.message}`);
        break;
      }
    }

    return { trades, finalBalance: balance };
  }
}

// Singleton
let globalSystem: TradingSystem | null = null;

export function getTradingSystem(config?: TradingSystemConfig): TradingSystem {
  if (!globalSystem && config) {
    globalSystem = new TradingSystem(config);
  }
  if (!globalSystem) {
    throw new Error('TradingSystem not initialized. Call getTradingSystem(config) first.');
  }
  return globalSystem;
}
