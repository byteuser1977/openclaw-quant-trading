/**
 * 验证工具函数
 * TODO: 实现参数验证辅助
 */

export function isPositiveNumber(value: any): boolean {
  return typeof value === 'number' && value > 0;
}

export function isString(value: any): boolean {
  return typeof value === 'string';
}

export function isObject(value: any): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
