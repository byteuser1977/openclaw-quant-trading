import { getRiskManager, RiskManager } from '@/skills/risk';
import { getVault } from '@/core/vault';
import { ValidationError } from '@/core/errors';

/**
 * 交易信号
 */
export interface TradeSignal {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  atr?: number;              // 波动率 (ATR)
  stoplossPrice?: number;    // 手动止损价格 (可选)
  metadata?: Record<string, any>;
}

/**
 * 风险管理集成器
 * 
 * 将风险管理策略应用于实际交易：
 * - 自动计算仓位大小
 * - 生成动态止损价格
 * - 执行熔断检查
 * - 记录风险事件
 */
export class RiskIntegration {
  private riskManager: RiskManager;
  private vault = getVault();
  private currentBalance: number = 0;
  private dailyPnL: number = 0;
  private weeklyPnL: number = 0;
  private maxDrawdown: number = 0;
  private peakBalance: number = 0;
  private consecutiveLosses: number = 0;
  private tradeHistory: Array<{ pnl: number; timestamp: number }> = [];

  constructor() {
    this.riskManager = getRiskManager();
  }

  /**
   * 更新账户余额 (供监控线程调用)
   */
  updateBalance(balance: number): void {
    this.currentBalance = balance;
    if (balance > this.peakBalance) {
      this.peakBalance = balance;
    }
    // 计算当前回撤
    if (this.peakBalance > 0) {
      this.maxDrawdown = (this.peakBalance - balance) / this.peakBalance;
    }
  }

  /**
   * 记录一笔交易的盈亏结果
   */
  recordTradeResult(pnl: number): void {
    this.tradeHistory.push({ pnl, timestamp: Date.now() });
    
    if (pnl < 0) {
      this.consecutiveLosses++;
      this.dailyPnL += pnl; // 假设 dailyPnL 更新需由外部提供，这里简化
    } else {
      this.consecutiveLosses = 0;
    }
  }

  /**
   * 评估交易信号并返回合规的交易参数
   * 
   * 这是策略代码实际调用的入口点
   */
  evaluateSignal(signal: TradeSignal, riskParams: {
    positionMethod?: 'fixed_ratio' | 'fixed_amount' | 'kelly' | 'kelly_fraction';
    stoplossType?: 'fixed' | 'trailing' | 'atr' | 'hybrid';
    riskPerTrade?: number;         // 2%
    fixedAmount?: number;          // $100 per trade
    stoplossPct?: number;          // 10%
    atrMultiplier?: number;        // 2.0 for ATR stoploss
    kellyFraction?: number;        // 0.5 for Half Kelly
    winRate?: number;              // for Kelly
    avgWin?: number;               // for Kelly
    avgLoss?: number;              // for Kelly
    isLong?: boolean;              // trade direction
  } = {}): { approved: boolean; reason?: string; executionParams?: any } {
    
    // 1. 熔断检查 - 先看系统是否允许交易
    const circuit = this.riskManager.checkCircuitBreaker({
      dailyPnL: this.dailyPnL,
      weeklyPnL: this.weeklyPnL,
      totalPnL: (this.currentBalance / (this.peakBalance || 1)) - 1,
      maxDrawdown: this.maxDrawdown,
      consecutiveLosses: this.consecutiveLosses,
    });

    if (circuit.triggered) {
      return {
        approved: false,
        reason: `Circuit breaker level ${circuit.level}: ${circuit.reason}`,
      };
    }

    // 2. 计算仓位大小
    const positionMethod = riskParams.positionMethod || 'fixed_ratio';
    const sizingParams = {
      balance: this.currentBalance,
      entryPrice: signal.price,
      riskPerTrade: riskParams.riskPerTrade || 0.02,
      stoplossPct: riskParams.stoplossPct || 0.1,
      fixedAmount: riskParams.fixedAmount,
      winRate: riskParams.winRate,
      avgWin: riskParams.avgWin,
      avgLoss: riskParams.avgLoss,
      kellyFraction: riskParams.kellyFraction,
    };

    let positionResult;
    try {
      positionResult = this.riskManager.calculatePositionSize(positionMethod, sizingParams);
    } catch (error) {
      return {
        approved: false,
        reason: `Position sizing error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }

    // 检查仓位是否过小 (< 0.0001 units) 或超过账户余额
    if (positionResult.units < 0.0001) {
      return {
        approved: false,
        reason: `Position size too small: ${positionResult.units}`,
      };
    }

    // 3. 计算止损价格
    const stoplossType = riskParams.stoplossType || 'atr';
    const stoplossParams = {
      type: stoplossType,
      entryPrice: signal.price,
      currentPrice: signal.price,
      isLong: signal.side === 'BUY',
      stoplossPct: riskParams.stoplossPct,
      atr: signal.atr,
      atrMultiplier: riskParams.atrMultiplier || 2,
    };

    let stoplossResult;
    try {
      stoplossResult = this.riskManager.calculateStoploss(stoplossType, {
        entryPrice: signal.price,
        currentPrice: signal.price,
        atr: signal.atr,
        atrMultiplier: riskParams.atrMultiplier || 2,
        isLong: signal.side === 'BUY',
        stoplossPct: riskParams.stoplossPct,
      });
    } catch (error) {
      return {
        approved: false,
        reason: `Stoploss calculation error: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    }

    // 4. 综合检查：止损价格不能过于激进 (例如，距离入场 > 50%)
    const stoplossDistancePct = stoplossType === 'atr' 
      ? (stoplossResult.stoplossPct / 100)
      : riskParams.stoplossPct || 0.1;

    if (stoplossDistancePct > 0.5) {
      return {
        approved: false,
        reason: `Stoploss too wide: ${(stoplossDistancePct * 100).toFixed(2)}%`,
      };
    }

    // 5. 返回合规的执行参数
    return {
      approved: true,
      executionParams: {
        symbol: signal.symbol,
        side: signal.side,
        quantity: positionResult.units,
        stoploss: stoplossResult.stoplossPrice,
        positionValue: positionResult.positionValue,
        riskMetrics: {
          riskAmount: positionResult.riskAmount,
          riskPercent: positionResult.riskPercent,
          stoplossPct: stoplossResult.stoplossPct,
        },
      },
    };
  }

  /**
   * 获取当前风险状态摘要
   */
  getRiskSummary(): {
    balance: number;
    peakBalance: number;
    maxDrawdown: number;
    dailyPnL: number;
    weeklyPnL: number;
    consecutiveLosses: number;
    circuitBreaker: any;
  } {
    const circuit = this.riskManager.checkCircuitBreaker({
      dailyPnL: this.dailyPnL,
      weeklyPnL: this.weeklyPnL,
      totalPnL: (this.currentBalance / (this.peakBalance || 1)) - 1,
      maxDrawdown: this.maxDrawdown,
      consecutiveLosses: this.consecutiveLosses,
    });

    return {
      balance: this.currentBalance,
      peakBalance: this.peakBalance,
      maxDrawdown: this.maxDrawdown,
      dailyPnL: this.dailyPnL,
      weeklyPnL: this.weeklyPnL,
      consecutiveLosses: this.consecutiveLosses,
      circuitBreaker: {
        triggered: circuit.triggered,
        level: circuit.level,
        reason: circuit.reason,
      },
    };
  }

  /**
   * 重置风险跟踪状态 (用于每日/每周重置)
   */
  resetDailyMetrics(): void {
    this.dailyPnL = 0;
  }

  resetWeeklyMetrics(): void {
    this.weeklyPnL = 0;
  }

  resetConsecutiveLosses(): void {
    this.consecutiveLosses = 0;
  }
}

// 导出单例
let globalRiskIntegration: RiskIntegration | null = null;

export function getRiskIntegration(): RiskIntegration {
  if (!globalRiskIntegration) {
    globalRiskIntegration = new RiskIntegration();
  }
  return globalRiskIntegration;
}
