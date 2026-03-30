/**
 * Strategy Validator
 *
 * Validates strategy templates and compiled Python code.
 * Checks: required methods, indicator dependencies, parameter definitions.
 */

import { StrategyTemplate, Condition, ConditionNode } from './compiler';
import { IndicatorConfig } from './indicators';
import { Logger } from '../../core/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

export interface ValidationResult {
  valid: boolean;
  errors: StrategyValidationError[];
  warnings: StrategyValidationWarning[];
  metrics: ValidationMetrics;
}

export interface StrategyValidationError {
  line?: number;
  message: string;
  severity: 'error';
  code: string;
}

export interface StrategyValidationWarning {
  line?: number;
  message: string;
  severity: 'warning';
  code: string;
}

export interface ValidationMetrics {
  indicatorsCount: number;
  parametersCount: number;
  entryConditions: number;
  exitConditions: number;
  complexityScore: number; // 0-100
}

// Type guard for Condition (plain condition objects do NOT have a 'type' property)
function isCondition(obj: Condition | ConditionNode): obj is Condition {
  return !(obj as any).type;
}

// Extract condition from node (either standalone or within group)
function getConditionFromNode(node: Condition | ConditionNode): Condition | null {
  if (isCondition(node)) {
    return node.condition;
  }
  // If it's a group, we don't return anything here; recursion will handle children
  return null;
}

// Flatten conditions (including nested groups)
function flattenConditions(conditions: (Condition | ConditionNode)[]): Condition[] {
  const result: Condition[] = [];

  function traverse(node: Condition | ConditionNode) {
    if (isCondition(node)) {
      // Plain condition
      result.push(node);
    } else {
      // ConditionNode
      if (node.type === 'condition' && node.condition) {
        result.push(node.condition);
      }
      if (node.type === 'group' && node.children) {
        node.children.forEach(traverse);
      }
    }
  }

  conditions.forEach(traverse);
  return result;
}

export class StrategyValidator {
  private logger = Logger.getLogger('validator');

  async validateTemplate(template: StrategyTemplate): Promise<ValidationResult> {
    const errors: StrategyValidationError[] = [];
    const warnings: StrategyValidationWarning[] = [];

    // 1. Basic required fields
    if (!template.name || template.name.trim().length === 0) {
      errors.push({ message: 'Strategy name is required', severity: 'error', code: 'VAL_001' });
    }
    if (!template.timeframe) {
      errors.push({ message: 'Timeframe is required', severity: 'error', code: 'VAL_002' });
    } else if (!/^[0-9]+[mhdw]$/.test(template.timeframe)) {
      errors.push({ message: `Invalid timeframe format: ${template.timeframe}. Use e.g., '5m', '1h', '1d'`, severity: 'error', code: 'VAL_003' });
    }

    // 2. Indicators validation
    if (template.indicators.length === 0) {
      errors.push({ message: 'At least one indicator is required', severity: 'error', code: 'VAL_004' });
    } else {
      for (const ind of template.indicators) {
        if (!ind.name) {
          errors.push({ message: 'Indicator missing name', severity: 'error', code: 'VAL_005' });
        }
        if (!ind.function) {
          errors.push({ message: `Indicator ${ind.name} missing function`, severity: 'error', code: 'VAL_006' });
        }
        if (!ind.output) {
          errors.push({ message: `Indicator ${ind.name} missing output column`, severity: 'error', code: 'VAL_007' });
        }
        if (Object.keys(ind.params).length === 0) {
          warnings.push({ message: `Indicator ${ind.name} has no parameters`, severity: 'warning', code: 'VAL_W01' });
        }
      }
    }

    // 3. Entry/Exit conditions validation (flatten to Condition[])
    this.validateConditionList(template.entryConditions, 'entry', errors, warnings);
    this.validateConditionList(template.exitConditions, 'exit', errors, warnings);

    // 4. Check for undefined indicator references in conditions
    const indicatorOutputs = new Set(template.indicators.map((i) => i.output));
    const flatEntry = flattenConditions(template.entryConditions);
    const flatExit = flattenConditions(template.exitConditions);
    const allConditions = [...flatEntry, ...flatExit];

    for (const cond of allConditions) {
      if (!indicatorOutputs.has(cond.left) && cond.left !== 'open' && cond.left !== 'high' &&
          cond.left !== 'low' && cond.left !== 'close' && cond.left !== 'volume') {
        warnings.push({
          message: `Condition references undefined indicator/column: ${cond.left}`,
          severity: 'warning',
          code: 'VAL_W02',
        });
      }
      if (cond.rightIsColumn && !indicatorOutputs.has(cond.right as string)) {
        warnings.push({
          message: `Condition compares to undefined indicator/column: ${cond.right}`,
          severity: 'warning',
          code: 'VAL_W03',
        });
      }
    }

    // 5. Parameter validation
    const paramErrors = this.validateParameters(template.parameters);
    errors.push(...paramErrors);

    // Calculate metrics
    const metrics: ValidationMetrics = {
      indicatorsCount: template.indicators.length,
      parametersCount: Object.keys(template.parameters).length,
      entryConditions: flatEntry.length,
      exitConditions: flatExit.length,
      complexityScore: this.calculateComplexity(template),
    };

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics,
    };
  }

  async validatePythonCode(pythonCode: string): Promise<ValidationResult> {
    const errors: StrategyValidationError[] = [];
    const warnings: StrategyValidationWarning[] = [];

    // 1. Syntax check using Python compiler
    try {
      const tempDir = tmpdir();
      const tempFile = path.join(tempDir, `strategy_${Date.now()}.py`);
      fs.writeFileSync(tempFile, pythonCode);

      try {
        await execAsync('python -m py_compile ' + tempFile);
      } finally {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      }
    } catch (error: any) {
      // Parse Python syntax error
      const match = error.stderr?.match(/.*?line (\d+).*?:\s*(.+)/);
      if (match) {
        const line = parseInt(match[1], 10);
        const message = match[2].trim();
        errors.push({ line, message, severity: 'error', code: 'PY_SYNTAX' });
      } else {
        errors.push({ message: 'Python syntax error', severity: 'error', code: 'PY_SYNTAX' });
      }
      return {
        valid: false,
        errors,
        warnings,
        metrics: { indicatorsCount: 0, parametersCount: 0, entryConditions: 0, exitConditions: 0, complexityScore: 0 },
      };
    }

    // 2. Check for required methods
    const requiredMethods = ['populate_indicators', 'populate_entry_trend', 'populate_exit_trend'];
    for (const method of requiredMethods) {
      if (!pythonCode.includes(`def ${method}(self`)) {
        errors.push({
          message: `Missing required method: ${method}`,
          severity: 'error',
          code: 'VAL_008',
        });
      }
    }

    // 3. Check for IStrategy inheritance
    if (!pythonCode.includes('class') || !pythonCode.includes('IStrategy')) {
      warnings.push({
        message: 'Strategy class should inherit from IStrategy',
        severity: 'warning',
        code: 'VAL_W04',
      });
    }

    // 4. Check for common mistakes
    if (pythonCode.includes('dataframe.loc[:,') && !pythonCode.includes('dataframe.loc[')) {
      warnings.push({
        message: 'Consider using vectorized operations instead of .loc for better performance',
        severity: 'warning',
        code: 'VAL_W05',
      });
    }

    // 5. Check for TODO or FIXME comments
    const todoMatches = pythonCode.matchAll(/# (TODO|FIXME): (.+)/g);
    for (const match of todoMatches) {
      warnings.push({
        message: ` TODO/FIXME: ${match[2]}`,
        severity: 'warning',
        code: 'VAL_W06',
      });
    }

    // 6. Estimate complexity (basic metrics)
    const lines = pythonCode.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    const complexityScore = Math.min(100, lines.length / 2);

    const metrics: ValidationMetrics = {
      indicatorsCount: (pythonCode.match(/ta\.\w+\(/g) || []).length,
      parametersCount: (pythonCode.match(/^    \w+ = /gm) || []).length,
      entryConditions: (pythonCode.match(/enter_long/g) || []).length,
      exitConditions: (pythonCode.match(/exit_long/g) || []).length,
      complexityScore,
    };

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metrics,
    };
  }

  async validate(template: StrategyTemplate, pythonCode?: string): Promise<ValidationResult> {
    const templateResult = await this.validateTemplate(template);
    if (pythonCode) {
      const pythonResult = await this.validatePythonCode(pythonCode);
      return {
        valid: templateResult.valid && pythonResult.valid,
        errors: [...templateResult.errors, ...pythonResult.errors],
        warnings: [...templateResult.warnings, ...pythonResult.warnings],
        metrics: pythonResult.metrics,
      };
    }
    return templateResult;
  }

  private validateConditionList(conditions: (Condition | ConditionNode)[], type: 'entry' | 'exit', errors: StrategyValidationError[], warnings: StrategyValidationWarning[]): void {
    const flat = flattenConditions(conditions);

    if (flat.length === 0) {
      warnings.push({
        message: `No ${type} conditions defined`,
        severity: 'warning',
        code: 'VAL_W07',
      });
      return;
    }

    for (let i = 0; i < flat.length; i++) {
      const cond = flat[i];
      if (!cond.left) {
        errors.push({ message: `Condition ${i + 1} missing left operand`, severity: 'error', code: 'VAL_009' });
      }
      if (!cond.operator) {
        errors.push({ message: `Condition ${i + 1} missing operator`, severity: 'error', code: 'VAL_010' });
      } else {
        const validOps = ['<', '<=', '>', '>=', '==', '!='];
        if (!validOps.includes(cond.operator)) {
          errors.push({ message: `Condition ${i + 1} has invalid operator: ${cond.operator}`, severity: 'error', code: 'VAL_011' });
        }
      }
      if (cond.right === undefined) {
        errors.push({ message: `Condition ${i + 1} missing right operand`, severity: 'error', code: 'VAL_012' });
      }

      // Skip logic warning for flattened list; original grouping determines logic
    }
  }

  private validateParameters(params: Record<string, any>): StrategyValidationError[] {
    const errors: StrategyValidationError[] = [];
    const reserved = ['timeframe', 'startup_candle_count', 'INTERFACE_VERSION', 'minimal_roi', 'stoploss'];
    for (const key of Object.keys(params)) {
      if (reserved.includes(key) && typeof params[key] === 'undefined') {
        errors.push({
          message: `Parameter "${key}" shadows reserved attribute and is undefined`,
          severity: 'error',
          code: 'VAL_013',
        });
      }
    }
    return errors;
  }

  private calculateComplexity(template: StrategyTemplate): number {
    const indicatorComplexity = template.indicators.length * 10;
    const conditionComplexity = flattenConditions(template.entryConditions).length + flattenConditions(template.exitConditions).length * 5;
    const paramComplexity = Object.keys(template.parameters).length * 2;
    const total = indicatorComplexity + conditionComplexity + paramComplexity;
    return Math.min(100, Math.round(total / 3));
  }

  static analyzeCode(code: string): { hasEntry: boolean; hasExit: boolean; indicatorCount: number } {
    const hasEntry = code.includes('enter_long') || code.includes('buy');
    const hasExit = code.includes('exit_long') || code.includes('sell');
    const indicatorCount = (code.match(/ta\.\w+\(/g) || []).length;
    return { hasEntry, hasExit, indicatorCount };
  }
}

// Singleton
let validator: StrategyValidator | null = null;

export function getStrategyValidator(): StrategyValidator {
  if (!validator) {
    validator = new StrategyValidator();
  }
  return validator;
}

export async function validateStrategy(template: StrategyTemplate, pythonCode?: string): Promise<ValidationResult> {
  return getStrategyValidator().validate(template, pythonCode);
}

export function quickValidateCode(code: string): { hasEntry: boolean; hasExit: boolean; indicatorCount: number } {
  return StrategyValidator.analyzeCode(code);
}
