/**
 * 风险管理核心类
 */
export class RiskManager {
  private dailyPnL: number = 0;
  private weeklyPnL: number = 0;
  private consecutiveLosses: number = 0;
  private peakBalance: number = 0;
  private currentBalance: number = 0;
  private startOfDayBalance: number = 0;

  /**
   * 计算仓位大小 - 返回 units (数量)
   * 支持两种调用风格：
   * - (method: string, config: {balance, ...}) - 旧风格
   * - (params: {method, ...}, context: {balance}) - 新风格
   * @returns number - position units
   */
  calculatePositionSize(arg1: any, arg2?: any): number {
    let method: string;
    let config: any = {};
    let context: any = {};

    if (typeof arg1 === 'string') {
      method = arg1;
      config = arg2 || {};
      context = { balance: config.balance };
    } else {
      method = arg1.method;
      config = { ...arg1 };
      context = arg2 || {};
    }

    const balance = context.balance ?? config.balance;
    if (balance === undefined) {
      throw new Error('balance is required');
    }

    const { amount, riskPerTrade, maxPositionSize, winRate, avgWin, avgLoss, kellyFraction } = config;

    let positionSize: number;

    switch (method) {
      case 'fixed_amount':
        if (!amount) throw new Error('amount required for fixed_amount');
        positionSize = amount;
        break;
      case 'fixed_ratio':
        const ratio = riskPerTrade || 0.02;
        positionSize = balance * ratio;
        break;
      case 'kelly':
        if (!winRate || !avgWin || !avgLoss) {
          throw new Error('winRate, avgWin, avgLoss required for kelly');
        }
        const b = avgWin / Math.abs(avgLoss);
        const kelly = winRate / b - (1 - winRate);
        positionSize = balance * kelly * (kellyFraction || 1);
        break;
      case 'kelly_fraction':
        if (!winRate || !avgWin || !avgLoss) {
          throw new Error('winRate, avgWin, avgLoss required for kelly_fraction');
        }
        const b2 = avgWin / Math.abs(avgLoss);
        const fullKelly = winRate / b2 - (1 - winRate);
        positionSize = balance * fullKelly * (kellyFraction || 0.5);
        break;
      default:
        throw new Error(`Unknown position sizing method: ${method}`);
    }

    if (maxPositionSize && positionSize > maxPositionSize) {
      positionSize = maxPositionSize;
    }

    if (positionSize <= 0) {
      positionSize = 0;
    }

    return positionSize;
  }

  /**
   * 计算仓位大小并返回完整指标 (供集成使用)
   */
  calculatePositionSizeWithMetrics(arg1: any, arg2?: any): {
    units: number;
    riskAmount: number;
    riskPercent: number;
    positionValue: number;
  } {
    const result = this.calculatePositionSize(arg1, arg2);
    // Determine riskPercent from the config
    let method: string;
    let config: any = {};
    if (typeof arg1 === 'string') {
      method = arg1;
      config = arg2 || {};
    } else {
      method = arg1.method;
      config = { ...arg1 };
    }
    const riskPercent = config.riskPerTrade || 0.02;
    const riskAmount = result * riskPercent;
    return {
      units: result,
      riskAmount,
      riskPercent,
      positionValue: result,
    };
  }

  /**
   * 计算止损价格 - 返回价格数值
   */
  calculateStoploss(config: any, context?: any): number {
    const {
      type = 'fixed',
      stoplossPct = 0.1,
      atr,
      atrMultiplier = 2,
      trailingPct = 0.05,
      entryPrice: configEntryPrice,
    } = config;

    const entryPrice = (context as any)?.entryPrice ?? configEntryPrice;
    const currentPrice = (context as any)?.currentPrice ?? entryPrice;
    const isLongCtx = (context as any)?.isLong;
    const sideCtx = (context as any)?.side;
    const atrCtx = (context as any)?.atr;

    const long = isLongCtx !== undefined ? isLongCtx : sideCtx === 'BUY';

    if (entryPrice === undefined) {
      throw new Error('entryPrice is required for stoploss calculation');
    }

    let stopPrice: number;

    if (type === 'fixed') {
      const pct = stoplossPct || 0.1;
      stopPrice = long ? entryPrice * (1 - pct) : entryPrice * (1 + pct);
      return stopPrice;
    }

    if (type === 'atr') {
      const multiplier = atrMultiplier;
      const atr_val = atrCtx || atr || (entryPrice * 0.02);
      stopPrice = long ? entryPrice - atr_val * multiplier : entryPrice + atr_val * multiplier;
      return stopPrice;
    }

    if (type === 'trailing') {
      const trailing = trailingPct;
      stopPrice = long ? currentPrice * (1 - trailing) : currentPrice * (1 + trailing);
      return stopPrice;
    }

    throw new Error(`Unknown stoploss type: ${type}`);
  }

  /**
   * 计算止损并返回详情 (价格和百分比)
   */
  calculateStoplossWithDetails(config: any, context?: any): { stoplossPrice: number; stoplossPct: number } {
    const {
      type = 'fixed',
      stoplossPct = 0.1,
      atr,
      atrMultiplier = 2,
      trailingPct = 0.05,
      entryPrice: configEntryPrice,
    } = config;

    const entryPrice = (context as any)?.entryPrice ?? configEntryPrice;
    const currentPrice = (context as any)?.currentPrice ?? entryPrice;
    const isLongCtx = (context as any)?.isLong;
    const sideCtx = (context as any)?.side;
    const atrCtx = (context as any)?.atr;

    const long = isLongCtx !== undefined ? isLongCtx : sideCtx === 'BUY';

    if (entryPrice === undefined) {
      throw new Error('entryPrice is required for stoploss calculation');
    }

    let stopPrice: number;
    let actualPct: number;

    if (type === 'fixed') {
      const pct = stoplossPct || 0.1;
      stopPrice = long ? entryPrice * (1 - pct) : entryPrice * (1 + pct);
      actualPct = pct;
    } else if (type === 'atr') {
      const multiplier = atrMultiplier;
      const atr_val = atrCtx || atr || (entryPrice * 0.02);
      stopPrice = long ? entryPrice - atr_val * multiplier : entryPrice + atr_val * multiplier;
      actualPct = (atr_val * multiplier) / entryPrice;
    } else if (type === 'trailing') {
      const trailing = trailingPct;
      stopPrice = long ? currentPrice * (1 - trailing) : currentPrice * (1 + trailing);
      actualPct = trailing;
    } else {
      throw new Error(`Unknown stoploss type: ${type}`);
    }

    return { stoplossPrice: stopPrice, stoplossPct: actualPct };
  }

  /**
   * 检查熔断条件
   */
  checkCircuitBreaker(config: {
    dailyLossThreshold?: number;
    weeklyLossThreshold?: number;
    maxDrawdownThreshold?: number;
    maxConsecutiveLosses?: number;
  } = {}): { triggered: boolean; level: number; reason: string } {
    const {
      dailyLossThreshold = 0.1,
      weeklyLossThreshold = 0.15,
      maxDrawdownThreshold = 0.2,
      maxConsecutiveLosses = 3,
    } = config;

    const { dailyPnL, weeklyPnL, consecutiveLosses, peakBalance, currentBalance, startOfDayBalance } = this;

    const startBalance = startOfDayBalance || peakBalance || currentBalance;
    const maxDrawdown = peakBalance > 0 ? (peakBalance - currentBalance) / peakBalance : 0;

    if (dailyPnL < -Math.abs(startBalance * dailyLossThreshold)) {
      return { triggered: true, level: 1, reason: `Daily loss ${dailyPnL} exceeds threshold ${dailyLossThreshold}` };
    }

    if (consecutiveLosses >= maxConsecutiveLosses) {
      return { triggered: true, level: 2, reason: `Consecutive losses ${consecutiveLosses} exceeds limit ${maxConsecutiveLosses}` };
    }

    if (maxDrawdown > maxDrawdownThreshold) {
      return { triggered: true, level: 3, reason: `Max drawdown ${(maxDrawdown * 100).toFixed(2)}% exceeds threshold ${maxDrawdownThreshold * 100}%` };
    }

    if (weeklyPnL < -Math.abs(startBalance * weeklyLossThreshold)) {
      return { triggered: true, level: 4, reason: `Weekly loss ${weeklyPnL} exceeds threshold ${weeklyLossThreshold}` };
    }

    return { triggered: false, level: 0, reason: 'OK' };
  }

  /**
   * 记录交易盈亏结果
   */
  recordTradeResult(pnl: number): void {
    this.dailyPnL += pnl;
    this.weeklyPnL += pnl;
    if (pnl < 0) {
      this.consecutiveLosses++;
    } else {
      this.consecutiveLosses = 0;
    }
  }

  /**
   * 更新日度指标
   */
  updateDailyMetrics(metrics: {
    dailyPnL?: number;
    startOfDayBalance?: number;
    consecutiveLosses?: number;
    peakBalance?: number;
    currentBalance?: number;
  }) {
    if (metrics.dailyPnL !== undefined) this.dailyPnL = metrics.dailyPnL;
    if (metrics.startOfDayBalance !== undefined) this.startOfDayBalance = metrics.startOfDayBalance;
    if (metrics.consecutiveLosses !== undefined) this.consecutiveLosses = metrics.consecutiveLosses;
    if (metrics.peakBalance !== undefined) this.peakBalance = metrics.peakBalance;
    if (metrics.currentBalance !== undefined) this.currentBalance = metrics.currentBalance;
  }

  /**
   * 更新周度指标
   */
  updateWeeklyMetrics(metrics: {
    weeklyPnL?: number;
    peakBalance?: number;
    currentBalance?: number;
  }) {
    if (metrics.weeklyPnL !== undefined) this.weeklyPnL = metrics.weeklyPnL;
    if (metrics.peakBalance !== undefined) this.peakBalance = metrics.peakBalance;
    if (metrics.currentBalance !== undefined) this.currentBalance = metrics.currentBalance;
  }

  /**
   * 获取当前日度指标
   */
  getDailyMetrics() {
    return {
      dailyPnL: this.dailyPnL,
      consecutiveLosses: this.consecutiveLosses,
      peakBalance: this.peakBalance,
      currentBalance: this.currentBalance,
      startOfDayBalance: this.startOfDayBalance,
      maxDrawdown: this.peakBalance > 0 ? (this.peakBalance - this.currentBalance) / this.peakBalance : 0,
    };
  }

  /**
   * 获取当前周度指标
   */
  getWeeklyMetrics() {
    return {
      weeklyPnL: this.weeklyPnL,
      peakBalance: this.peakBalance,
      currentBalance: this.currentBalance,
      maxDrawdown: this.peakBalance > 0 ? (this.peakBalance - this.currentBalance) / this.peakBalance : 0,
    };
  }

  /**
   * 重置风险跟踪状态
   */
  reset() {
    this.dailyPnL = 0;
    this.weeklyPnL = 0;
    this.consecutiveLosses = 0;
  }
}

// Singleton
let globalRiskManager: RiskManager | null = null;
export function getRiskManager(): RiskManager {
  if (!globalRiskManager) {
    globalRiskManager = new RiskManager();
  }
  return globalRiskManager;
}
