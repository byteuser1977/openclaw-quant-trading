import { getPersistence } from '../persistence';
import { TradeRecord } from '../persistence';

/**
 * 交易统计指标
 */
export interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;             // 0-1
  totalPnL: number;            // 总盈亏
  avgPnL: number;              // 平均盈亏
  avgWin: number;              // 平均盈利
  avgLoss: number;             // 平均亏损
  profitFactor: number;        // 盈亏比 (总盈利/总亏损)
  avgHoldingTime?: number;     // 平均持仓时间 (ms)
  maxDrawdown: number;         // 最大回撤 (0-1)
  sharpeRatio?: number;        // 夏普比率 (可选)
  startBalance?: number;       // 期初余额 (如有)
  endBalance?: number;         // 期末余额 (如有)
}

/**
 * 报告生成选项
 */
export interface ReportOptions {
  includeTradeList?: boolean;  // 是否包含交易明细表
  maxTrades?: number;          // 最多显示多少条交易
  format: 'markdown' | 'csv' | 'json';
}

/**
 * Reporting 管理器
 */
export class ReportingManager {
  private persistence = getPersistence();

  /**
   * 计算交易统计指标
   */
  calculateStats(trades: TradeRecord[]): TradeStats {
    // 只考虑已结算 (有 pnl) 的交易
    const settledTrades = trades.filter(t => t.pnl !== undefined && t.pnl !== null);
    if (settledTrades.length === 0) {
      return {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnL: 0,
        avgPnL: 0,
        avgWin: 0,
        avgLoss: 0,
        profitFactor: 0,
        maxDrawdown: 0,
      };
    }

    const wins = settledTrades.filter(t => t.pnl! > 0);
    const losses = settledTrades.filter(t => t.pnl! < 0);
    const totalPnL = settledTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const totalWin = wins.reduce((sum, t) => sum + t.pnl!, 0);
    const totalLoss = losses.reduce((sum, t) => sum + t.pnl!, 0);

    const avgWin = wins.length ? totalWin / wins.length : 0;
    const avgLoss = losses.length ? totalLoss / losses.length : 0;
    const profitFactor = totalLoss < 0 ? Math.abs(totalWin / totalLoss) : Infinity;

    // 计算最大回撤 (基于累计盈亏序列)
    const sortedByTime = [...settledTrades].sort((a, b) => a.timestamp - b.timestamp);
    const cumulativePnL: number[] = [];
    let runningSum = 0;
    for (const t of sortedByTime) {
      runningSum += t.pnl!;
      cumulativePnL.push(runningSum);
    }
    
    let peak = -Infinity;
    let maxDrawdown = 0;
    for (const equity of cumulativePnL) {
      if (equity > peak) peak = equity;
      const drawdown = (peak - equity) / (peak || 1);
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // 平均持仓时间 (需要 entry/exit 时间，这里暂无，暂设为 0)
    const avgHoldingTime = 0;

    return {
      totalTrades: settledTrades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: wins.length / settledTrades.length,
      totalPnL,
      avgPnL: totalPnL / settledTrades.length,
      avgWin,
      avgLoss,
      profitFactor,
      avgHoldingTime,
      maxDrawdown,
    };
  }

  /**
   * 生成 Markdown 格式报告
   */
  generateMarkdownReport(trades: TradeRecord[], options: ReportOptions = { format: 'markdown' }): string {
    const stats = this.calculateStats(trades);
    const now = new Date().toISOString();

    let md = `# 交易报告\n\n`;
    md += `**生成时间**: ${now}\n\n`;

    md += `## 统计摘要\n\n`;
    md += `| 指标 | 数值 |\n|------|------|\n`;
    md += `| 总交易次数 | ${stats.totalTrades} |\n`;
    md += `| 盈利交易 | ${stats.winningTrades} |\n`;
    md += `| 亏损交易 | ${stats.losingTrades} |\n`;
    md += `| 胜率 | ${(stats.winRate * 100).toFixed(2)}% |\n`;
    md += `| 总盈亏 | $${stats.totalPnL.toFixed(2)} |\n`;
    md += `| 平均盈亏 | $${stats.avgPnL.toFixed(2)} |\n`;
    md += `| 平均盈利 | $${stats.avgWin.toFixed(2)} |\n`;
    md += `| 平均亏损 | $${stats.avgLoss.toFixed(2)} |\n`;
    md += `| 盈亏比 | ${stats.profitFactor.toFixed(2)} |\n`;
    md += `| 最大回撤 | ${(stats.maxDrawdown * 100).toFixed(2)}% |\n`;

    if (options.includeTradeList && trades.length > 0) {
      md += `\n## 交易明细\n\n`;
      md += `| 时间 | 交易对 | 方向 | 价格 | 数量 | 盈亏 |\n|------|--------|------|------|------|------|\n`;

      const displayTrades = options.maxTrades 
        ? trades.slice(0, options.maxTrades)
        : trades;

      displayTrades.forEach(t => {
        const date = new Date(t.timestamp).toLocaleString();
        const pnlStr = t.pnl !== undefined ? `$${t.pnl.toFixed(2)}` : '-';
        md += `| ${date} | ${t.symbol} | ${t.side} | ${t.price.toFixed(2)} | ${t.quantity} | ${pnlStr} |\n`;
      });
    }

    return md;
  }

  /**
   * 生成 CSV 格式报告
   */
  generateCSV(trades: TradeRecord[]): string {
    const headers = ['timestamp', 'symbol', 'side', 'price', 'quantity', 'orderId', 'strategyName', 'pnl', 'fee'];
    const rows = trades.map(t => [
      t.timestamp,
      t.symbol,
      t.side,
      t.price,
      t.quantity,
      t.orderId || '',
      t.strategyName || '',
      t.pnl ?? '',
      t.fee ?? '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  /**
   * 生成完整报告并保存到文件 (本地)
   */
  async generateAndSaveReport(filePath: string, options: ReportOptions = { format: 'markdown' }): Promise<void> {
    const trades = await this.persistence.listTrades({ pageSize: 1000 });
    const allTrades = trades.records;

    let content: string;
    if (options.format === 'csv') {
      content = this.generateCSV(allTrades);
    } else {
      content = this.generateMarkdownReport(allTrades, { ...options, format: 'markdown' });
    }

    // 写入本地文件 (使用 Node's fs)
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
  }

  /**
   * 从数据库加载所有交易并生成报告 (便捷方法)
   */
  async generateReportFromDatabase(options: ReportOptions = { format: 'markdown' }): Promise<string> {
    const { records } = await this.persistence.listTrades({ pageSize: 1000 });
    return this.generateMarkdownReport(records, options);
  }
}

// 导出单例
let globalReporting: ReportingManager | null = null;

export function getReporting(): ReportingManager {
  if (!globalReporting) {
    globalReporting = new ReportingManager();
  }
  return globalReporting;
}
