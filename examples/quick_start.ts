// Quick Start: 使用 quant-trading 技能包
// ==========================================
// 本示例展示如何导入并使用量化交易技能的各个模块

// 技能包入口点 - 导入所有模块
import * as Quant from 'quant-trading';

// 1️⃣ Strategy 模块：构建策略
// ==========================
const { StrategyBuilder } = Quant;

// 创建一个简单的 MA 交叉策略
const builder = new StrategyBuilder('MyMA');

// 设置时间框架
builder.setTimeframe('1h');

// 添加技术指标
builder.addIndicator('SMA', { timeperiod: 10 }, 'fast_sma');
builder.addIndicator('SMA', { timeperiod: 30 }, 'slow_sma');

// 定义入场/出场条件
builder.addBuyCondition('fast_sma', '>', 'slow_sma');
builder.addSellCondition('fast_sma', '<', 'slow_sma');

// 定义 Hyperopt 可优化的参数（用于自动参数搜索）
builder.defineIntParameter('fast_period', 5, 50, 10);
builder.defineIntParameter('slow_period', 10, 200, 30);
builder.defineDecimalParameter('stoploss', -0.1, -0.01, -0.05);

// 编译策略（生成可执行的 Python 代码）
const pythonCode = builder.compile();
console.log('生成的策略 Python 代码：\n');
console.log(pythonCode);

// 2️⃣ Backtesting 模块：执行回测
// ============================
const { BacktestEngine } = Quant;

async function runBacktest() {
  const engine = new BacktestEngine();

  const result = await engine.run({
    strategy: builder.build(),
    pairs: ['BTC/USDT'],
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    stakeAmount: 1000, // USDT
    feeRate: 0.001,    // 0.1% 交易费
  });

  console.log('\n回测结果：');
  console.log('总收益率:', result.totalReturn * 100, '%');
  console.log('夏普比率:', result.sharpeRatio);
  console.log('最大回撤:', result.maxDrawdown * 100, '%');
  console.log('总交易数:', result.totalTrades);
}

// 3️⃣ Risk 模块：风险管理
// =====================
const { RiskManager } = Quant;

// 计算仓位大小（基于凯利公式）
const positionSize = RiskManager.calculatePositionSize({
  balance: 10000,
  riskPerTrade: 0.02, // 2% 风险
  stoplossPct: 0.05,  // 5% 止损
  method: 'kelly',
});
console.log('\n建议仓位大小:', positionSize);

// 4️⃣ Data 模块：数据管理
// =====================
const { DataManager } = Quant;

async function downloadData() {
  const dm = new DataManager();
  await dm.downloadData({
    pairs: ['BTC/USDT'],
    exchange: 'binance',
    timeframe: '1h',
    startDate: '2024-01-01',
    endDate: '2024-12-31',
    datadir: './data',
  });
  console.log('数据下载完成');
}

// 5️⃣ Hyperopt 模块：参数优化
// =========================
const { HyperoptEngine } = Quant;

async function runHyperopt() {
  const hyperopt = new HyperoptEngine();

  const bestParams = await hyperopt.optimize({
    strategy: builder.build(),
    parameterSpace: builder.getParameterSpace(),
    epochs: 50,
    objective: 'sharpe',
  });

  console.log('\n最优参数组合：', bestParams);
}

// ==========================================
// 主程序入口
// ==========================================
async function main() {
  console.log('OpenClaw Quant Trading 示例\n');

  // 下载数据（第一次运行需要）
  // await downloadData();

  // 运行回测
  // await runBacktest();

  // 执行参数优化（需要较长时间）
  // await runHyperopt();

  console.log('\n更多示例请参考文档：docs/strategy_templates.md');
}

main().catch(console.error);
