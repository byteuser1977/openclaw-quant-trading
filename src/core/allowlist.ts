/**
 * 端点规则 - 定义允许访问的 API 端点
 */
export interface EndpointRule {
  /** 规则名称（用于日志和调试） */
  name: string;
  /** URL 模式（支持 wildcard） */
  pattern: string;
  /** 允许的 HTTP 方法 */
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH')[];
  /** 可选速率限制（每秒请求数） */
  rateLimitPerSecond?: number;
  /** 可选：需要哪些密钥作用域 */
  requiredScopes?: string[];
  /** 可选：描述 */
  description?: string;
}

/**
 * 匹配结果
 */
interface MatchResult {
  allowed: boolean;
  rule?: EndpointRule;
  reason?: string;
}

/**
 * Allowlist - 端点访问控制
 *
 * 设计目标:
 * 1. 每个 skill 只能访问声明的端点
 * 2. 支持通配符和正则匹配
 * 3. 速率限制（可选）
 * 4. 审计日志
 *
 * 参考 IronClaw 网络端点白名单设计
 */
export class Allowlist {
  private rules: EndpointRule[] = [];
  private requestCounts: Map<string, number[]> = new Map(); // 用于速率限制
  private auditLogger: (msg: string) => void;

  constructor(auditLogger?: (msg: string) => void) {
    this.auditLogger = auditLogger || console.log;
  }

  /**
   * 加载规则
   */
  loadRules(rules: EndpointRule[]): void {
    this.rules = rules;
    this.auditLogger(`[Allowlist] Loaded ${rules.length} rules`);
  }

  /**
   * 添加单个规则
   */
  addRule(rule: EndpointRule): void {
    this.rules.push(rule);
    this.auditLogger(`[Allowlist] Added rule: ${rule.name} (${rule.pattern})`);
  }

  /**
   * 移除规则
   */
  removeRule(patternOrName: string): void {
    const before = this.rules.length;
    this.rules = this.rules.filter(r => r.name !== patternOrName && r.pattern !== patternOrName);
    this.auditLogger(`[Allowlist] Removed rule: ${patternOrName} (${before - this.rules.length} removed)`);
  }

  /**
   * 检查请求是否允许
   */
  permits(url: string, method: string, context?: { skillName?: string }): MatchResult {
    // 查找匹配的规则
    const matchedRule = this.rules.find(rule => {
      const methodMatch = rule.methods.includes(method as any);
      if (!methodMatch) return false;
      return this.matchPattern(url, rule.pattern);
    });

    if (!matchedRule) {
      const reason = `No allowlist rule matched: ${method} ${url}`;
      this.auditLogger(`[Allowlist] DENIED: ${reason}${context ? ` (skill: ${context.skillName})` : ''}`);
      return { allowed: false, reason };
    }

    // 检查速率限制
    if (matchedRule.rateLimitPerSecond) {
      const now = Date.now();
      const windowStart = now - 1000; // 1 秒窗口
      const key = `${matchedRule.pattern}:${method}`;
      
      // 清理旧记录
      const counts = this.requestCounts.get(key) || [];
      const recent = counts.filter(t => t > windowStart);
      
      if (recent.length >= matchedRule.rateLimitPerSecond!) {
        const reason = `Rate limit exceeded: ${recent.length}/${matchedRule.rateLimitPerSecond} per second`;
        this.auditLogger(`[Allowlist] RATE LIMITED: ${reason}`);
        return { allowed: false, rule: matchedRule, reason };
      }
      
      recent.push(now);
      this.requestCounts.set(key, recent);
    }

    this.auditLogger(`[Allowlist] ALLOWED: ${method} ${url} (rule: ${matchedRule.name})`);
    return { allowed: true, rule: matchedRule };
  }

  /**
   * URL 模式匹配（支持 * 和 ? wildcard）
   */
  private matchPattern(url: string, pattern: string): boolean {
    // 转换为正则表达式
    const regexPattern = '^' + pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
      .replace(/\*/g, '.*')  // * 匹配任意字符序列
      .replace(/\?/g, '.')   // ? 匹配单个字符
      + '$';
    
    try {
      const regex = new RegExp(regexPattern);
      return regex.test(url);
    } catch (e) {
      console.error(`[Allowlist] Invalid pattern: ${pattern}`, e);
      return false;
    }
  }

  /**
   * 获取所有规则
   */
  getRules(): EndpointRule[] {
    return [...this.rules];
  }

  /**
   * 验证规则配置（检查是否有冲突）
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const rule of this.rules) {
      if (!rule.name) {
        errors.push('Rule missing name');
      }
      if (!rule.pattern) {
        errors.push(`Rule ${rule.name || 'unnamed'}: missing pattern`);
      }
      if (!rule.methods || rule.methods.length === 0) {
        errors.push(`Rule ${rule.name}: missing methods`);
      }
      // 检查重复模式
      const duplicates = this.rules.filter(r => r.pattern === rule.pattern && r !== rule);
      if (duplicates.length > 0) {
        errors.push(`Rule ${rule.name}: duplicate pattern with ${duplicates.map(d => d.name).join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * 导出配置
   */
  export(): EndpointRule[] {
    return this.rules.map(({ name, pattern, methods, rateLimitPerSecond, requiredScopes, description }) => ({
      name,
      pattern,
      methods,
      rateLimitPerSecond,
      requiredScopes,
      description,
    }));
  }

  /**
   * 清空所有规则
   */
  clear(): void {
    this.rules = [];
    this.requestCounts.clear();
    this.auditLogger('[Allowlist] All rules cleared');
  }
}

/**
 * 全局 Allowlist 实例
 */
let globalAllowlist: Allowlist | null = null;

/**
 * 初始化 Allowlist
 */
export function initAllowlist(rules?: EndpointRule[], auditLogger?: (msg: string) => void): Allowlist {
  if (!globalAllowlist) {
    globalAllowlist = new Allowlist(auditLogger);
    if (rules) {
      globalAllowlist.loadRules(rules);
    }
    const validation = globalAllowlist.validate();
    if (!validation.valid) {
      console.error('[Allowlist] Validation failed:', validation.errors);
      throw new Error('Allowlist validation failed');
    }
  }
  return globalAllowlist;
}

/**
 * 获取全局 Allowlist 实例
 */
export function getAllowlist(): Allowlist {
  if (!globalAllowlist) {
    throw new Error('Allowlist not initialized. Call initAllowlist() first.');
  }
  return globalAllowlist;
}

/**
 * 辅助函数：为交易所 Adapter 创建默认规则
 */
export function createExchangeAllowlist(
  baseUrl: string,
  methods: ('GET' | 'POST' | 'PUT' | 'DELETE')[] = ['GET', 'POST']
): EndpointRule[] {
  return [
    {
      name: 'Exchange Account Info',
      pattern: `${baseUrl}/api/v3/account`,
      methods: ['GET'],
      description: 'Get account balance',
    },
    {
      name: 'Exchange Order',
      pattern: `${baseUrl}/api/v3/order`,
      methods: ['POST'],
      description: 'Create order',
    },
    {
      name: 'Exchange Order Cancel',
      pattern: `${baseUrl}/api/v3/order/*`,
      methods: ['DELETE'],
      description: 'Cancel order',
    },
    {
      name: 'Exchange Ticker',
      pattern: `${baseUrl}/api/v3/ticker/*`,
      methods: ['GET'],
      description: 'Get ticker price',
    },
    {
      name: 'Exchange Kline/Candlestick',
      pattern: `${baseUrl}/api/v3/klines`,
      methods: ['GET'],
      description: 'Get kline data',
    },
  ];
}
