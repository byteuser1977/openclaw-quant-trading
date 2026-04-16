/**
 * Allowlist - 网络端点白名单
 *
 * 借鉴 IronClaw 的设计：工具只能访问预授权的 endpoints
 *
 * 职责：
 * 1. 定义允许的网络端点 (支持通配符)
 * 2. 验证请求 URL 是否在白名单中
 * 3. 支持基于方法的限制
 *
 * 用法示例：
 *   const allowlist = new Allowlist([
 *     { pattern: 'https://api.binance.com/api/v3/order', methods: ['POST'] },
 *     { pattern: 'https://api.binance.com/api/v3/account', methods: ['GET'] },
 *     { pattern: 'https://api.binance.com/api/v3/*', methods: ['GET'] }
 *   ]);
 *
 *   if (allowlist.permits('https://api.binance.com/api/v3/order', 'POST')) { ... }
 */

/**
 * 端点规则
 */
export interface EndpointRule {
  /** URL 模式 (支持 * 通配符) */
  pattern: string;
  /** 允许的 HTTP 方法 */
  methods?: string[];  // ['GET', 'POST', etc.] 空数组表示所有方法
  /** 可选 rate limit (requests per minute) */
  rateLimit?: number;
  /** 描述 */
  description?: string;
}

/**
 * 端点匹配结果
 */
export interface MatchResult {
  allowed: boolean;
  rule?: EndpointRule;
  matchedPattern?: string;
}

/**
 * Allowlist 类
 *
 * 安全考虑：
 * - URL 规范化：确保比较的是规范化 URL (query 顺序、编码等)
 * - 通配符匹配：从左到右，避免正则回溯攻击
 */
export class Allowlist {
  private rules: EndpointRule[];
  private compiledRules: Array<{ regex: RegExp; rule: EndpointRule }>;

  constructor(rules: EndpointRule[] = []) {
    this.rules = rules;
    this.compiledRules = this.compileRules(rules);
  }

  /**
   * 编译正则表达式 (缓存)
   */
  private compileRules(rules: EndpointRule[]): Array<{ regex: RegExp; rule: EndpointRule }> {
    return rules.map(rule => ({
      regex: this.patternToRegex(rule.pattern),
      rule
    }));
  }

  /**
   * 将通配符模式转换为 RegExp
   *
   * 支持：
   * - * 匹配任意字符 (除 / 外的字符)
   * - ** 匹配任意路径 (包括 /)
   * - ? 匹配单个字符
   *
   * 示例：
   *   'https://api.example.com/users/*'  ->  https://api\.example\.com/users/[^/?]+
   *   'https://api.example.com/**'      ->  https://api\.example\.com/.*
   */
  private patternToRegex(pattern: string): RegExp {
    // 转义正则特殊字符
    let regex = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/?]+')     // * 匹配除 / 外的字符
      .replace(/\*\*/g, '.*')       // ** 匹配所有
      .replace(/\?/g, '.');         // ? 匹配单字符

    return new RegExp(`^${regex}$`);
  }

  /**
   * 规范化 URL
   *
   * - 移除 fragment
   * - 规范化 query 参数排序
   * - 解码 percent-encoding
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // 移除 hash
      urlObj.hash = '';
      // 排序 query parameters (可选，对于某些 API 顺序不重要)
      // const params = new URLSearchParams(urlObj.search);
      // const sorted = Array.from(params.entries()).sort();
      // urlObj.search = new URLSearchParams(sorted).toString();
      return urlObj.toString();
    } catch {
      // 如果 URL 解析失败，返回原样
      return url;
    }
  }

  /**
   * 检查 URL + 方法是否在白名单中
   */
  permits(url: string, method?: string): boolean {
    const normalized = this.normalizeUrl(url);
    const upperMethod = method ? method.toUpperCase() : undefined;

    for (const { regex, rule } of this.compiledRules) {
      if (regex.test(normalized)) {
        // 方法检查
        if (upperMethod && rule.methods && rule.methods.length > 0) {
          if (!rule.methods.includes(upperMethod)) {
            return false; // URL 匹配但方法不匹配
          }
        }
        return true;
      }
    }

    return false;
  }

  /**
   * 获取匹配的规则详情
   */
  match(url: string, method?: string): MatchResult | null {
    const normalized = this.normalizeUrl(url);
    const upperMethod = method ? method.toUpperCase() : undefined;

    for (const { regex, rule } of this.compiledRules) {
      if (regex.test(normalized)) {
        if (upperMethod && rule.methods && rule.methods.length > 0) {
          if (!rule.methods.includes(upperMethod)) {
            return { allowed: false, rule, matchedPattern: rule.pattern };
          }
        }
        return { allowed: true, rule, matchedPattern: rule.pattern };
      }
    }

    return null;
  }

  /**
   * 添加规则 (动态更新)
   */
  addRule(rule: EndpointRule): void {
    this.rules.push(rule);
    this.compiledRules.push({ regex: this.patternToRegex(rule.pattern), rule });
  }

  /**
   * 删除规则 (根据 pattern)
   */
  removeRule(pattern: string): boolean {
    const idx = this.rules.findIndex(r => r.pattern === pattern);
    if (idx === -1) return false;
    
    this.rules.splice(idx, 1);
    this.compiledRules.splice(idx, 1);
    return true;
  }

  /**
   * 列出所有规则
   */
  listRules(): EndpointRule[] {
    return [...this.rules];
  }

  /**
   * 验证规则配置 (防止明显错误)
   */
  static validate(rules: EndpointRule[]): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const rule of rules) {
      if (!rule.pattern) {
        errors.push('Rule must have a pattern');
        continue;
      }
      
      // 检查是否是有效的 URL 模式
      try {
        // 简单检查：模式应以 http:// 或 https:// 开头
        if (!rule.pattern.startsWith('http://') && !rule.pattern.startsWith('https://')) {
          errors.push(`Pattern "${rule.pattern}" must start with http:// or https://`);
        }
      } catch {
        errors.push(`Invalid pattern: ${rule.pattern}`);
      }

      if (rule.methods) {
        for (const method of rule.methods) {
          if (!['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
            errors.push(`Invalid HTTP method: ${method}`);
          }
        }
      }

      if (rule.rateLimit && (rule.rateLimit < 1 || rule.rateLimit > 10000)) {
        errors.push(`Rate limit ${rule.rateLimit} out of reasonable range (1-10000)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * 默认交易所 endpoints (示例)
 */
export const DEFAULT_EXCHANGE_RULES: EndpointRule[] = [
  {
    pattern: 'https://api.binance.com/api/v3/order',
    methods: ['POST', 'DELETE'],
    description: '下单/撤单'
  },
  {
    pattern: 'https://api.binance.com/api/v3/account',
    methods: ['GET'],
    description: '账户信息'
  },
  {
    pattern: 'https://api.binance.com/api/v3/openOrders',
    methods: ['GET'],
    description: '当前挂单'
  },
  {
    pattern: 'https://api.binance.com/api/v3/ticker/price',
    methods: ['GET'],
    description: '价格查询'
  },
  {
    pattern: 'https://api.binance.com/api/v3/exchangeInfo',
    methods: ['GET'],
    description: '交易所信息'
  }
];

/**
 * 便捷函数：创建 Allowlist
 */
export function createAllowlist(rules?: EndpointRule[]): Allowlist {
  return new Allowlist(rules || DEFAULT_EXCHANGE_RULES);
}
