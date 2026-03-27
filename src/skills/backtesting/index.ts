import { getDataManager, OHLCV } from '../data';
import { getRiskIntegration, TradeSignal } from '../risk/integration';
import { getVault } from '../core/vault';
import { getLogger, Logger } from '../core/logger';
import { ValidationError } from '../core/errors';

/**
 * 回测配置参数
 */
export interface BacktestConfig {
  // 数据配置
  exchange: string;
  symbol: string;
  timeframe: string;
  startDate: number;   // 起始时间戳 (毫秒)
  endDate: number;     // 结束时间戳 (毫秒)
  
  // 策略配置
  strategyName: string;
  parameters: Record<string, any>;  // 策略参数 (如 rsi_period=14)
  
  // 风险管理配置
  riskConfig?: {
    positionMethod?: 'fixed_ratio' | 'fixed_amount' | 'kelly' | 'kelly_fraction';
    riskPerTrade?: number;
    stoplossType?: 'fixed' | 'trailing' | 'atr' | 'hybrid';
    stoplossPct?: number;
    atrMultiplier?: number;
  };
  
  // 初始资金
  initialBalance: number;
}

/**
 * 回测执行状态
 */
interface BacktestState {
  balance: number;
  position: number;         // 持仓数量 (正数为做多，负数为做空，0为无仓位)
  entryPrice: number | null;
  timestamp: number | null;
  tradeHistory: BacktestTrade[];
  equityCurve: number[];   // 资金曲线
  maxDrawdown: number;
}

/**
 * 回测中的单笔交易
 */
export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;               // 盈亏金额
  pnlPct: number;            // 盈亏百分比
  exitReason: 'signal' | 'stoploss' | 'manual';
}

/**
 * 回测结果汇总
 */
export interface BacktestResult {
  config: BacktestConfig;
  summary: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    totalPnLPct: number;
    avgPnL: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxDrawdown: number;
    maxDrawdownPct: number;
    sharpeRatio?: number;
    sortinoRatio?: number;
    calmarRatio?: number;
  };
  trades: BacktestTrade[];
  equityCurve: number[];      // 每笔交易后的资金
  timeline: EquityPoint[];    // 时间序列资金曲线
  completed: boolean;
}

/**
 * 资金曲线点
 */
export interface EquityPoint {
  timestamp: number;
  balance: number;
  drawdownPct: number;
}

/**
 * BacktestEngine - 回测引擎
 * 
 * 功能:
 * - 加载历史 OHLCV 数据
 * - 逐K执行策略逻辑 (需 strategy 函数)
 * - 自动风险管理 (仓位、止损)
 * - 交易执行模拟
 * - 结果分析
 */
export class BacktestEngine {
  private logger: Logger;
  private dataManager = getDataManager();
  private riskIntegration = getRiskIntegration();
  private vault = getVault();

  constructor() {
    this.logger = getLogger().child({ module: 'BacktestEngine' });
  }

  /**
   * 运行回测 (主入口)
   * 注意: 这是一个长时间运行的任务，应通过 runInWorker 执行
   */
  async run(config: BacktestConfig, strategyFn: StrategyFunction): Promise<BacktestResult> {
    this.logger.info('Starting backtest', { config });
    
    // 1. 加载数据
    const data = await this.loadData(config);
    if (data.length === 0) {
      throw new ValidationError('No data available for backtest');
    }

    // 2. 初始化回测状态
    const state: BacktestState = {
      balance: config.initialBalance,
      position: 0,
      entryPrice: null,
      timestamp: null,
      tradeHistory: [],
      equityCurve: [config.initialBalance],
      maxDrawdown: 0,
    };

    this.riskIntegration.updateBalance(config.initialBalance);
    this.riskIntegration.resetDailyMetrics();

    // 3. 逐K推进
    for (let i = 0; i < data.length; i++) {
      const candle = data[i];
      const currentPrice = candle.close;
      
      // 更新当前时间
      state.timestamp = candle.timestamp;

      // 如果有持仓，计算当前市值
      const currentEquity = state.balance + (state.position * currentPrice);
      state.equityCurve.push(currentEquity);

      // 更新最大回撤
      const peak = Math.max(...state.equityCurve);
      const drawdown = (peak - currentEquity) / peak;
      if (drawdown > state.maxDrawdown) {
        state.maxDrawdown = drawdown;
      }

      // 检查止损 (如果有持仓)
      if (state.position !== 0 && state.entryPrice !== null) {
        const stoplossExit = this.checkStoploss(state, candle, config.riskConfig);
        if (stoplossExit) {
          this.exitPosition(state, currentPrice, 'stoploss');
        }
      }

      // 调用策略函数获取信号
      // 策略函数接收当前K线数据和历史数据，返回是否买入/卖出
      const signal = await strategyFn({
        candle,
        pastData: data.slice(0, i + 1),
        state: {
          balance: state.balance,
          position: state.position,
          entryPrice: state.entryPrice,
        },
        parameters: config.parameters,
      });

      // 执行交易信号
      if (signal && !stoplossExit) {
        await this.executeSignal(signal, state, currentPrice, config);
      }
    }

    // 4. 回测结束，平掉所有仓位
    if (state.position !== 0) {
      const lastCandle = data[data.length - 1];
      this.exitPosition(state, lastCandle.close, 'signal');
    }

    // 5. 计算统计指标
    const result: BacktestResult = {
      config,
      summary: this.calculateSummary(state, config.initialBalance),
      trades: state.tradeHistory,
      equityCurve: state.equityCurve,
      timeline: this.buildTimeline(data, state.equityCurve),
      completed: true,
    };

    this.logger.info('Backtest completed', {
      totalTrades: result.summary.totalTrades,
      totalPnL: result.summary.totalPnL,
      maxDrawdown: result.summary.maxDrawdown,
    });

    return result;
  }

  /**
   * 加载历史数据
   */
  private async loadData(config: BacktestConfig): Promise<OHLCV[]> {
    this.logger.info('Loading OHLCV data', {
      exchange: config.exchange,
      symbol: config.symbol,
      timeframe: config.timeframe,
    });

    return await this.dataManager.downloadOHLCV({
      exchange: config.exchange,
      symbol: config.symbol,
      timeframe: config.timeframe,
      since: config.startDate,
      endTime: config.endDate,
      limit: 10000, // 足够大
    });
  }

  /**
   * 检查是否触发止损
   */
  private checkStoploss(
    state: BacktestState,
    candle: OHLCV,
    riskConfig?: BacktestConfig['riskConfig']
  ): boolean {
    if (!state.entryPrice || !riskConfig) return false;

    const isLong = state.position > 0;
    const stoplossPct = riskConfig.stoplossPct || 0.1;
    
    // 简化: 固定百分比止损
    if (isLong) {
      const stoplossPrice = state.entryPrice * (1 - stoplossPct);
      return candle.low <= stoplossPrice;
    } else {
      const stoplossPrice = state.entryPrice * (1 + stoplossPct);
      return candle.high >= stoplossPrice;
    }
  }

  /**
   * 执行交易信号
   */
  private async executeSignal(
    signal: TradeSignal,
    state: BacktestState,
    currentPrice: number,
    config: BacktestConfig
  ): Promise<void> {
    // 通过 RiskIntegration 检查是否允许交易
    const evaluation = this.riskIntegration.evaluateSignal(signal, {
      positionMethod: config.riskConfig?.positionMethod,
      riskPerTrade: config.riskConfig?.riskPerTrade,
      stoplossPct: config.riskConfig?.stoplossPct,
    });

    if (!evaluation.approved) {
      this.logger.warn('Trade rejected by risk manager', { reason: evaluation.reason });
      return;
    }

    const { executionParams } = evaluation;

    if (state.position === 0) {
      // 开仓
      state.position = executionParams.quantity * (signal.side === 'BUY' ? 1 : -1);
      state.entryPrice = currentPrice;
      this.logger.debug('Position opened', {
        side: signal.side,
        quantity: executionParams.quantity,
        price: currentPrice,
      });
    } else {
      // 如果已有仓位，反向操作则先平仓再开仓
      if ((signal.side === 'BUY' && state.position < 0) || (signal.side === 'SELL' && state.position > 0)) {
        this.exitPosition(state, currentPrice, 'signal');
        // 开新仓
        state.position = executionParams.quantity * (signal.side === 'BUY' ? 1 : -1);
        state.entryPrice = currentPrice;
      }
    }
  }

  /**
   * 平仓
   */
  private exitPosition(state: BacktestState, exitPrice: number, reason: BacktestTrade['exitReason']): void {
    if (state.position === 0 || state.entryPrice === null) return;

    const entryPrice = state.entryPrice;
    const quantity = Math.abs(state.position);
    const isLong = state.position > 0;

    const pnl = isLong
      ? (exitPrice - entryPrice) * quantity
      : (entryPrice - exitPrice) * quantity;
    const pnlPct = (exitPrice - entryPrice) / entryPrice * (isLong ? 1 : -1);

    const trade: BacktestTrade = {
      entryTime: state.timestamp || 0,
      exitTime: state.timestamp || 0,
      side: isLong ? 'BUY' : 'SELL',
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      pnlPct,
      exitReason: reason,
    };

    state.tradeHistory.push(trade);
    state.balance += pnl;
    state.position = 0;
    state.entryPrice = null;

    this.riskIntegration.recordTradeResult(pnl);
  }

  /**
   * 计算统计摘要
   */
  private calculateSummary(state: BacktestState, initialBalance: number): BacktestResult['summary'] {
    const trades = state.tradeHistory;
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl < 0);
    const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
    const totalWin = wins.reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = losses.reduce((sum, t) => sum + t.pnl, 0); // negative

    const avgPnL = totalTrades ? totalPnL / totalTrades : 0;
    const avgWin = wins.length ? totalWin / wins.length : 0;
    const avgLoss = losses.length ? totalLoss / losses.length : 0;
    const profitFactor = totalLoss < 0 ? Math.abs(totalWin / totalLoss) : Infinity;

    // 计算 Sharpe 比率 (假设无风险利率 0)
    const returns = trades.map(t => t.pnlPct);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1);
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    const totalReturn = (state.balance - initialBalance) / initialBalance;

    return {
      totalTrades,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: totalTrades ? wins.length / totalTrades : 0,
      totalPnL,
      totalPnLPct: totalReturn,
      avgPnL,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown: state.maxDrawdown,
      maxDrawdownPct: state.maxDrawdown * 100,
      sharpeRatio: Math.sqrt(252) * sharpeRatio, // annualized (assuming daily)
    };
  }

  /**
   * 构建时间序列资金曲线
   */
  private buildTimeline(data: OHLCV[], equityCurve: number[]): EquityPoint[] {
    // 将资金曲线与时间对齐 (每个K线一个点)
    const timeline: EquityPoint[] = [];
    for (let i = 0; i < data.length; i++) {
      const balance = equityCurve[i] || equityCurve[equityCurve.length - 1];
      const peakSoFar = Math.max(...equityCurve.slice(0, i + 1));
      const drawdownPct = (peakSoFar - balance) / peakSoFar * 100;

      timeline.push({
        timestamp: data[i].timestamp,
        balance,
        drawdownPct,
      });
    }
    return timeline;
  }
}

/**
 * 策略函数类型
 */
export type StrategyFunction = (ctx: {
  candle: OHLCV;
  pastData: OHLCV[];
  state: {
    balance: number;
    position: number;
    entryPrice: number | null;
  };
  parameters: Record<string, any>;
}) => Promise<TradeSignal | null>;

/**
 * 导出单例
 */
let globalBacktestEngine: BacktestEngine | null = null;

export function getBacktestEngine(): BacktestEngine {
  if (!globalBacktestEngine) {
    globalBacktestEngine = new BacktestEngine();
  }
  return globalBacktestEngine;
}
