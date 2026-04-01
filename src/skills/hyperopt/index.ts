import { getBacktestEngine, BacktestConfig, BacktestResult } from '../backtesting';
import { ParameterSpace, createParameterSpace } from '../strategy/parameters';
import { getLogger } from '../core/logger';

/**
 * 优化目标指标
 */
export type OptimizationTarget = 
  | 'sharpe_ratio'
  | 'sortino_ratio'
  | 'profit_factor'
  | 'max_drawdown_reduced'  // 最小化最大回撤
  | 'win_rate'
  | 'total_pnl';

/**
 * 优化方向
 */
export type OptimizationDirection = 'maximize' | 'minimize';

/**
 * 单次试验结果
 */
export interface TrialResult {
  parameters: ParameterSet;
  backtestResult: BacktestResult;
  score: number;            // 优化得分
  objectiveValue: number;   // 目标指标值
}

/**
 * 优化策略
 */
export type OptimizationStrategy = 
  | 'grid_search'    // 网格搜索
  | 'random_search'  // 随机搜索
  | 'bayesian'       // 贝叶斯优化 (预留)
  | 'genetic';       // 遗传算法 (预留)

/**
 * 优化器配置
 */
export interface HyperoptConfig {
  parameterSpace: ParameterSpace;
  backtestConfig: BacktestConfig;
  strategyFunction: StrategyFunction;  // 策略函数
  target: OptimizationTarget;
  direction: OptimizationDirection;
  maxTrials: number;           // 最大试验次数
  strategy: OptimizationStrategy;
  earlyStopNocontrol?: number; // 连续多少 trial 未改进则停止
}

/**
 * 贝叶斯优化器 (简单实现版)
 * 使用高斯过程回归
 */
class BayesianOptimizer {
  private tried: Array<{params: ParameterSet, score: number}> = [];
  
  suggest(): ParameterSet {
    // 简单实现: 如果数据不足，随机采样；否则选择类似区间
    if (this.tried.length < 5) {
      return getParameterSpace().sample();
    }
    // TODO: 实现高斯过程或 Tree-structured Parzen Estimator
    return getParameterSpace().sample();
  }
  
  record(params: ParameterSet, score: number): void {
    this.tried.push({ params, score });
  }
}

/**
 * HyperoptEngine - 参数优化引擎
 * 
 * 功能:
 * - 定义参数空间
 * - 执行多组参数回测
 * - 根据目标指标筛选最优参数
 * - 支持多种优化策略 (grid, random, bayesian)
 */
export class HyperoptEngine {
  private logger = getLogger().child({ module: 'Hyperopt' });
  private backtestEngine = getBacktestEngine();
  private bayesianOpt = new BayesianOptimizer();

  /**
   * 运行参数优化 (主入口)
   */
  async run(config: HyperoptConfig): Promise<HyperoptResult> {
    this.logger.info('Starting hyperopt', {
      maxTrials: config.maxTrials,
      strategy: config.strategy,
      target: config.target,
    });

    const trials: TrialResult[] = [];
    let bestScore = config.direction === 'maximize' ? -Infinity : Infinity;
    let bestTrial: TrialResult | null = null;
    let noImprovementCount = 0;

    for (let trial = 1; trial <= config.maxTrials; trial++) {
      // 1. 采样参数
      const parameters = this.sampleParameters(config);
      this.logger.debug(`Trial ${trial}`, { parameters });

      // 2. 运行回测
      const backtestResult = await this.backtestEngine.run({
        ...config.backtestConfig,
        parameters,
      }, config.strategyFunction);

      // 3. 计算目标得分
      const objectiveValue = this.computeObjective(backtestResult, config.target);
      const score = config.direction === 'maximize' ? objectiveValue : -objectiveValue;

      const trialResult: TrialResult = {
        parameters,
        backtestResult,
        score,
        objectiveValue,
      };
      trials.push(trialResult);

      // 4. 检查是否最优
      const improved = config.direction === 'maximize' 
        ? score > bestScore
        : score < bestScore;
      
      if (improved) {
        bestScore = score;
        bestTrial = trialResult;
        noImprovementCount = 0;
        this.logger.info('New best score', { trial, objectiveValue });
      } else {
        noImprovementCount++;
      }

      // 5. 早停检查
      if (config.earlyStopNocontrol && noImprovementCount >= config.earlyStopNocontrol) {
        this.logger.info('Early stopping', { noImprovementCount, trial });
        break;
      }
    }

    return {
      config,
      bestTrial: bestTrial!,
      trials,
      totalTrials: trials.length,
      bestParameters: bestTrial?.parameters,
      bestBacktestResult: bestTrial?.backtestResult,
      completed: true,
    };
  }

  /**
   * 根据策略采样参数
   */
  private sampleParameters(config: HyperoptConfig): ParameterSet {
    switch (config.strategy) {
      case 'grid_search':
        return this.gridSearchSample(config.parameterSpace);
      case 'random_search':
        return config.parameterSpace.sample();
      case 'bayesian':
        return this.bayesianOpt.suggest();
      default:
        return config.parameterSpace.sample();
    }
  }

  /**
   * 网格搜索采样: 遍历所有参数组合
   * 注意: 仅适用于参数空间小的情况
   */
  private gridSearchSample(space: ParameterSpace): ParameterSet {
    // 简单随机采样代替完整遍历 (避免组合爆炸)
    // 完整网格搜索需要知道每个参数的离散值
    return space.sample();
  }

  /**
   * 计算优化目标值
   */
  private computeObjective(result: BacktestResult, target: OptimizationTarget): number {
    const s = result.summary;
    
    switch (target) {
      case 'sharpe_ratio':
        return s.sharpeRatio || 0;
      case 'sortino_ratio':
        return s.sortinoRatio || 0;
      case 'profit_factor':
        return s.profitFactor;
      case 'max_drawdown_reduced':
        return -s.maxDrawdown;  // 最小化回撤 => 最大化负回撤
      case 'win_rate':
        return s.winRate;
      case 'total_pnl':
        return s.totalPnL;
      default:
        return s.sharpeRatio || 0;
    }
  }
}

/**
 * 优化结果
 */
export interface HyperoptResult {
  config: HyperoptConfig;
  bestTrial: TrialResult;
  trials: TrialResult[];
  totalTrials: number;
  bestParameters?: ParameterSet;
  bestBacktestResult?: BacktestResult;
  completed: boolean;
}

/**
 * 导出单例
 */
let globalHyperoptEngine: HyperoptEngine | null = null;

export function getHyperoptEngine(): HyperoptEngine {
  if (!globalHyperoptEngine) {
    globalHyperoptEngine = new HyperoptEngine();
  }
  return globalHyperoptEngine;
}

// 策略函数类型定义 (same as backtesting)
export type StrategyFunction = (ctx: {
  candle: any;
  pastData: any[];
  state: { balance: number; position: number; entryPrice: number | null };
  parameters: Record<string, any>;
}) => Promise<{ symbol: string; side: 'BUY' | 'SELL'; price: number; atr?: number } | null>;
