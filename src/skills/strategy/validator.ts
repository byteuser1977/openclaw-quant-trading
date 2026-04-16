/**
 * Strategy Validator
 * 验证策略配置的完整性、语法正确性、逻辑一致性
 */

import { getLogger } from '../../core/logger';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = getLogger('strategy-validator');

/**
 * 验证错误项
 */
export interface ValidationError {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  location?: string; // e.g., 'buyCondition', 'indicators[2]'
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  metadata?: {
    checkedAt: string;
    durationMs: number;
  };
}

/**
 * 策略验证器
 *
 * 检测项目:
 * - 配置完整性 (必需字段)
 * - 参数引用正确性
 * - 指标依赖存在
 * - Python 语法有效性
 * - 代码安全性 (危险函数)
 */
export class StrategyValidator {
  private requiredMethods = [
    'populate_indicators',
    'populate_buy_trend',
    'populate_sell_trend'
  ];

  private forbiddenFunctions = [
    'eval',
    'exec',
    '__import__',
    'open',
    'file',
    'input',
    'raw_input'
  ];

  /**
   * 验证策略配置
   */
  async validate(config: {
    name: string;
    className: string;
    parameters: any[];
    indicators: string[];
    buyCondition: string;
    sellCondition: string;
    timeframe: string;
  }): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. 基础配置检查
    this.validateBasicConfig(config, errors);

    // 2. 参数引用检查
    await this.validateParameterReferences(config, errors);

    // 3. 指标依赖检查
    this.validateIndicators(config, errors, warnings);

    // 4. 条件表达式检查
    this.validateConditions(config, errors, warnings);

    // 5. Python 语法验证 (如果生成了代码)
    // 这里假设我们先用 validatePythonCode 验证空模板
    // 实际使用时在 compile 后验证

    // 6. 安全性检查
    this.validateSecurity(config, warnings);

    const duration = Date.now() - startTime;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        checkedAt: new Date().toISOString(),
        durationMs: duration
      }
    };
  }

  /**
   * 基础配置验证
   */
  private validateBasicConfig(
    config: any,
    errors: ValidationError[]
  ): void {
    if (!config.name || config.name.trim().length === 0) {
      errors.push({
        code: 'MISSING_NAME',
        message: 'Strategy name is required',
        severity: 'error',
        location: 'name'
      });
    }

    if (!config.timeframe) {
      errors.push({
        code: 'MISSING_TIMEFRAME',
        message: 'Timeframe is required (e.g., "5m", "1h")',
        severity: 'error',
        location: 'timeframe'
      });
    } else if (!this.isValidTimeframe(config.timeframe)) {
      errors.push({
        code: 'INVALID_TIMEFRAME',
        message: `Timeframe '${config.timeframe}' is not valid`,
        severity: 'error',
        location: 'timeframe'
      });
    }

    if (!config.buyCondition) {
      errors.push({
        code: 'MISSING_BUY_CONDITION',
        message: 'Buy condition is required',
        severity: 'error',
        location: 'buyCondition'
      });
    }

    if (!config.sellCondition) {
      errors.push({
        code: 'MISSING_SELL_CONDITION',
        message: 'Sell condition is required',
        severity: 'error',
        location: 'sellCondition'
      });
    }
  }

  /**
   * 验证参数引用
   */
  private async validateParameterReferences(
    config: any,
    errors: ValidationError[]
  ): Promise<void> {
    const paramNames = config.parameters ? config.parameters.map((p: any) => p.name) : [];
    const knownIndicators = new Set(['RSI', 'EMA', 'SMA', 'WMA', 'MACD', 'ATR', 'BollingerBands', 'Stochastic', 'ADX', 'OBV', 'CCI', 'ROC'].map(i => i.toLowerCase()));

    const validateCondition = (condition: string, location: string) => {
      if (!condition) return;
      const usedVars = this.extractVariableNames(condition);
      for (const varName of usedVars) {
        const lowerVarName = varName.toLowerCase();
        // Skip if it's a known indicator
        if (knownIndicators.has(lowerVarName)) continue;
        // Check if it's a known parameter
        if (!paramNames.includes(varName)) {
          errors.push({
            code: 'UNKNOWN_PARAMETER',
            message: `${location} uses unknown parameter '${varName}'`,
            severity: 'error',
            location
          });
        }
      }
    };

    validateCondition(config.buyCondition, 'buyCondition');
    validateCondition(config.sellCondition, 'sellCondition');
  }

  /**
   * 提取条件表达式中的变量名 (e.g., "rsi < 30 and ema > close" -> ['rsi', 'ema', 'close'])
   */
  private extractVariableNames(expr: string): string[] {
    // 简单正则：匹配字母数字下划线开头的标识符
    const regex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    const matches = expr.match(regex) || [];
    // 过滤掉 Python 关键字和常见内置函数
    const keywords = ['and', 'or', 'not', 'if', 'else', 'True', 'False', 'None', 'len', 'range'];
    return [...new Set(matches)].filter(m => !keywords.includes(m) && !m.startsWith('self.'));
  }

  /**
   * 验证指标定义
   */
  private validateIndicators(
    config: any,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!config.indicators || config.indicators.length === 0) {
      warnings.push({
        code: 'NO_INDICATORS',
        message: 'No indicators defined',
        severity: 'warning',
        location: 'indicators'
      });
      return;
    }

    const knownIndicators = [
      'RSI', 'EMA', 'SMA', 'WMA', 'MACD', 'ATR',
      'BollingerBands', 'Stochastic', 'ADX', 'OBV', 'CCI', 'ROC'
    ];

    for (const indicator of config.indicators) {
      if (!knownIndicators.includes(indicator)) {
        warnings.push({
          code: 'UNKNOWN_INDICATOR',
          message: `Indicator '${indicator}' is not in the known list`,
          severity: 'warning',
          location: 'indicators'
        });
      }
    }
  }

  /**
   * 验证条件表达式
   */
  private validateConditions(
    config: any,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    // Check for empty conditions
    if (config.buyCondition && config.buyCondition.trim().length === 0) {
      errors.push({
        code: 'EMPTY_BUY_CONDITION',
        message: 'Buy condition is empty',
        severity: 'error',
        location: 'buyCondition'
      });
    }

    if (config.sellCondition && config.sellCondition.trim().length === 0) {
      errors.push({
        code: 'EMPTY_SELL_CONDITION',
        message: 'Sell condition is empty',
        severity: 'error',
        location: 'sellCondition'
      });
    }

    // Check for common mistakes
    for (const [type, condition] of [['buy', config.buyCondition], ['sell', config.sellCondition]]) {
      if (condition) {
        // Check for assignment (=) instead of comparison (==, <, >)
        if (condition.includes('=') && !condition.includes('==') && !condition.includes('>=') && !condition.includes('<=')) {
          warnings.push({
            code: 'POSSIBLE_ASSIGNMENT',
            message: `${type} condition contains '=' but not '==', '>=', or '<='. Did you mean comparison?`,
            severity: 'warning',
            location: `${type}Condition`
          });
        }

        // Check missing return value (should produce boolean series)
        if (!condition.includes('dataframe') && !condition.includes('[')) {
          warnings.push({
            code: 'CONDITION_STYLE',
            message: `${type} condition doesn't reference dataframe column directly. Ensure it returns boolean Series.`,
            severity: 'warning',
            location: `${type}Condition`
          });
        }
      }
    }
  }

  /**
   * 安全性检查
   */
  private validateSecurity(
    config: any,
    warnings: ValidationError[]
  ): void {
    const allCode = [config.buyCondition, config.sellCondition].join('\n');

    for (const forbidden of this.forbiddenFunctions) {
      if (allCode.includes(forbidden)) {
        warnings.push({
          code: 'FORBIDDEN_FUNCTION',
          message: `Use of forbidden function '${forbidden}' detected`,
          severity: 'warning',
          location: 'conditions'
        });
      }
    }
  }

  /**
   * 验证 Python 代码语法
   */
  async validatePythonSyntax(code: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Write to temp file
    const tempDir = path.join(__dirname, '../../.tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `strategy_${Date.now()}.py`);
    try {
      fs.writeFileSync(tempFile, code, 'utf-8');

      // Try to compile
      try {
        await execAsync(`python -m py_compile "${tempFile}"`, { timeout: 10000 });
      } catch (error: any) {
        const message = this.parsePythonError(error.stdout || error.stderr || error.message);
        errors.push({
          code: 'PYTHON_SYNTAX_ERROR',
          message,
          severity: 'error',
          location: 'generated_code'
        });
      }

      // Optional: try to import the module (requires freqtrade in PYTHONPATH)
      // Skipping for now as it's heavy

    } catch (err: any) {
      errors.push({
        code: 'FILE_ERROR',
        message: `Failed to write/validate temp file: ${err.message}`,
        severity: 'error'
      });
    } finally {
      // Cleanup
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        checkedAt: new Date().toISOString(),
        durationMs: 0
      }
    };
  }

  /**
   * 解析 Python 编译错误，提取友好信息
   */
  private parsePythonError(errorText: string): string {
    const lines = errorText.split('\n');
    const relevant: string[] = [];

    for (const line of lines) {
      if (line.includes('SyntaxError') || line.includes('IndentationError') || line.includes('TabError')) {
        relevant.push(line.trim());
      } else if (line.includes('^') || line.includes('caret')) {
        relevant.push(line.trim());
      }
    }

    return relevant.length > 0 ? relevant.join('\n') : errorText;
  }

  /**
   * 验证 Freqtrade 策略接口完整性
   */
  validateFreqtradeInterface(className: string, code: string): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check class inherits from IStrategy
    if (!code.includes('IStrategy')) {
      errors.push({
        code: 'MISSING_ISTRATEGY',
        message: `Strategy class must inherit from IStrategy`,
        severity: 'error',
        location: 'class_definition'
      });
    }

    // Check required methods exist
    for (const method of this.requiredMethods) {
      if (!code.includes(`def ${method}(`)) {
        errors.push({
          code: 'MISSING_METHOD',
          message: `Required method '${method}' not found`,
          severity: 'error',
          location: 'class_body'
        });
      }
    }

    // Check timeframe is set
    if (!code.includes('timeframe =')) {
      warnings.push({
        code: 'MISSING_TIMEFRAME_ATTR',
        message: 'Class attribute "timeframe" not set',
        severity: 'warning',
        location: 'class_body'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        checkedAt: new Date().toISOString(),
        durationMs: 0
      }
    };
  }

  /**
   * 辅助: 验证 timeframe 格式
   */
  private isValidTimeframe(tf: string): boolean {
    // Freqtrade timeframe: number + unit (m, h, d)
    return /^\d+[mhd]$/.test(tf);
  }
}

/**
 * 便捷验证函数
 */
export async function validateStrategy(config: any, compiledCode?: string): Promise<ValidationResult> {
  const validator = new StrategyValidator();

  // 1. 验证配置结构
  const result = await validator.validate(config);
  if (!result.valid) {
    return result;
  }

  // 2. 如果提供了编译代码，验证 Python 语法
  if (compiledCode) {
    const pyResult = await validator.validatePythonSyntax(compiledCode);
    result.errors.push(...pyResult.errors);
    result.warnings.push(...pyResult.warnings);
    result.valid = result.errors.length === 0;
  }

  return result;
}
