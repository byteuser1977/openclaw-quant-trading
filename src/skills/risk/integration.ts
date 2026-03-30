import { getRiskManager, RiskManager } from './risk-manager';
import { getVault } from '../../core/vault';
import { ValidationError } from '../../core/errors';

/**
 * 交易信号
 */
export interface TradeSignal {
  symbol: string;
  side: 'BUY' | 'SELL';
  price: number;
  atr?: number;
  stoplossPrice?: number;
  metadata?: Record<string, any>;
}

/**
 * 风险管理集成器
 * 将风险管理策略应用于实际交易
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

  updateBalance(balance: number): void {
    this.currentBalance = balance;
    if (balance > this.peakBalance) {
      this.peakBalance = balance;
    }
    if (this.peakBalance > 0) {
      this.maxDrawdown = (this.peakBalance - balance) / this.peakBalance;
    }
  }

  recordTradeResult(pnl: number): void {
    this.tradeHistory.push({ pnl, timestamp: Date.now() });
    if (pnl < 0) {
      this.consecutiveLosses++;
      this.dailyPnL += pnl;
    } else {
      this.consecutiveLosses = 0;
    }
  }

  async evaluateSignal(
    signal: TradeSignal,
    riskParams: {
      positionMethod?: 'fixed_ratio' | 'fixed_amount' | 'kelly' | 'kelly_fraction';
      stoplossType?: 'fixed' | 'trailing' | 'atr' | 'hybrid';
      riskPerTrade?: number;
      fixedAmount?: number;
      stoplossPct?: number;
      atrMultiplier?: number;
      kellyFraction?: number;
      winRate?: number;
      avgWin?: number;
      avgLoss?: number;
      isLong?: boolean;
      maxPositionSize?: number;
    } = {}
  ): Promise<{ approved: boolean; reason?: string; executionParams?: any }> {
    // Sync state to RiskManager
    this.riskManager.updateDailyMetrics({
      dailyPnL: this.dailyPnL,
      consecutiveLosses: this.consecutiveLosses,
      peakBalance: this.peakBalance,
      currentBalance: this.currentBalance,
    });
    this.riskManager.updateWeeklyMetrics({
      weeklyPnL: this.weeklyPnL,
      peakBalance: this.peakBalance,
      currentBalance: this.currentBalance,
    });

    // 1. 熔断检查
    const circuit = this.riskManager.checkCircuitBreaker();
    if (circuit.triggered) {
      return { approved: false, reason: `Circuit breaker level ${circuit.level}: ${circuit.reason}` };
    }

    // 2. 计算仓位大小
    const positionMethod = riskParams.positionMethod || 'fixed_ratio';
    let units: number;
    let riskAmount: number;
    let riskPercent: number;
    try {
      const config = {
        method: positionMethod,
        riskPerTrade: riskParams.riskPerTrade || 0.02,
        maxPositionSize: riskParams.maxPositionSize,
        amount: riskParams.fixedAmount,
        winRate: riskParams.winRate,
        avgWin: riskParams.avgWin,
        avgLoss: riskParams.avgLoss,
        kellyFraction: riskParams.kellyFraction,
      };
      const context = { balance: this.currentBalance };
      units = this.riskManager.calculatePositionSize(config, context);
      if (units < 0.0001) {
        return { approved: false, reason: `Position size too small: ${units}` };
      }
      // Compute derived metrics for response
      riskPercent = riskParams.riskPerTrade || 0.02;
      riskAmount = units * riskPercent;
    } catch (error) {
      return { approved: false, reason: `Position sizing error: ${error instanceof Error ? error.message : 'unknown'}` };
    }

    // 3. 计算止损价格
    const stoplossType = riskParams.stoplossType || 'atr';
    let stoplossPrice: number;
    let stoplossPct: number;
    try {
      const stopConfig = {
        type: stoplossType,
        entryPrice: signal.price,
        stoplossPct: riskParams.stoplossPct,
        atr: signal.atr,
        atrMultiplier: riskParams.atrMultiplier || 2,
      };
      const stopContext = {
        isLong: signal.side === 'BUY',
        currentPrice: signal.price,
      };
      const details = this.riskManager.calculateStoplossWithDetails(stopConfig, stopContext);
      stoplossPrice = details.stoplossPrice;
      stoplossPct = details.stoplossPct;
    } catch (error) {
      return { approved: false, reason: `Stoploss calculation error: ${error instanceof Error ? error.message : 'unknown'}` };
    }

    // 4. 综合检查：止损价格不能过于激进 (例如，距离入场 > 50%)
    const stoplossDistancePct =
      stoplossType === 'atr' ? stoplossPct : (riskParams.stoplossPct || 0.1);
    if (stoplossDistancePct > 0.5) {
      return { approved: false, reason: `Stoploss too wide: ${(stoplossDistancePct * 100).toFixed(2)}%` };
    }

    // 5. 返回合规的执行参数
    return {
      approved: true,
      executionParams: {
        symbol: signal.symbol,
        side: signal.side,
        quantity: units,
        stoploss: stoplossPrice,
        positionValue: units,
        riskMetrics: {
          riskAmount,
          riskPercent,
          stoplossPct,
        },
      },
    };
  }

  getRiskSummary(): {
    balance: number;
    peakBalance: number;
    maxDrawdown: number;
    dailyPnL: number;
    weeklyPnL: number;
    consecutiveLosses: number;
    circuitBreaker: any;
  } {
    // Sync state to RiskManager
    this.riskManager.updateDailyMetrics({
      dailyPnL: this.dailyPnL,
      consecutiveLosses: this.consecutiveLosses,
      peakBalance: this.peakBalance,
      currentBalance: this.currentBalance,
    });
    this.riskManager.updateWeeklyMetrics({
      weeklyPnL: this.weeklyPnL,
      peakBalance: this.peakBalance,
      currentBalance: this.currentBalance,
    });

    const circuit = this.riskManager.checkCircuitBreaker();

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
