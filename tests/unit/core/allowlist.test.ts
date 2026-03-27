// @ts-nocheck
/**
 * Unit tests for Allowlist module
 */

import { Allowlist, EndpointRule, createExchangeAllowlist, initAllowlist, getAllowlist } from '@/core/allowlist';

describe('Allowlist', () => {
  let allowlist: Allowlist;

  beforeEach(() => {
    allowlist = new Allowlist();
  });

  describe('basic operations', () => {
    it('should load rules', () => {
      const rules: EndpointRule[] = [
        {
          name: 'Test API',
          pattern: 'https://api.example.com/v1/*',
          methods: ['GET', 'POST'],
        },
      ];
      allowlist.loadRules(rules);
      expect(allowlist.getRules()).toHaveLength(1);
    });

    it('should add individual rule', () => {
      const rule: EndpointRule = {
        name: 'Add Rule Test',
        pattern: 'https://test.com/data',
        methods: ['GET'],
      };
      allowlist.addRule(rule);
      expect(allowlist.getRules().find(r => r.name === 'Add Rule Test')).toBeDefined();
    });

    it('should remove rule by name', () => {
      allowlist.addRule({
        name: 'ToRemove',
        pattern: 'https://remove.me',
        methods: ['DELETE'],
      });
      expect(allowlist.getRules()).toHaveLength(1);
      
      allowlist.removeRule('ToRemove');
      expect(allowlist.getRules()).toHaveLength(0);
    });

    it('should clear all rules', () => {
      allowlist.addRule({
        name: 'Rule1',
        pattern: 'https://rule1.com',
        methods: ['GET'],
      });
      allowlist.addRule({
        name: 'Rule2',
        pattern: 'https://rule2.com',
        methods: ['POST'],
      });
      expect(allowlist.getRules()).toHaveLength(2);
      
      allowlist.clear();
      expect(allowlist.getRules()).toHaveLength(0);
    });
  });

  describe('pattern matching', () => {
    const setupRules = (rules: EndpointRule[]) => {
      allowlist.loadRules(rules);
    };

    it('should match exact URL', () => {
      setupRules([
        {
          name: 'Exact',
          pattern: 'https://api.example.com/endpoint',
          methods: ['GET'],
        },
      ]);

      const result = allowlist.permits('https://api.example.com/endpoint', 'GET');
      expect(result.allowed).toBe(true);
      expect(result.rule?.name).toBe('Exact');
    });

    it('should support wildcard * pattern', () => {
      setupRules([
        {
          name: 'Wildcard',
          pattern: 'https://api.example.com/v1/*',
          methods: ['GET'],
        },
      ]);

      expect(allowlist.permits('https://api.example.com/v1/users', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/v1/orders/123', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/v2/users', 'GET').allowed).toBe(false);
    });

    it('should support wildcard ? pattern for single char', () => {
      setupRules([
        {
          name: 'SingleChar',
          pattern: 'https://api.example.com/item?.json',
          methods: ['GET'],
        },
      ]);

      expect(allowlist.permits('https://api.example.com/item1.json', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/itemA.json', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/item12.json', 'GET').allowed).toBe(false);
      expect(allowlist.permits('https://api.example.com/item.json', 'GET').allowed).toBe(false);
    });

    it('should escape regex special chars in pattern', () => {
      setupRules([
        {
          name: 'SpecialChars',
          pattern: 'https://api.example.com/data(test)',
          methods: ['GET'],
        },
      ]);

      const result = allowlist.permits('https://api.example.com/data(test)', 'GET');
      expect(result.allowed).toBe(true);
    });
  });

  describe('method validation', () => {
    it('should require matching HTTP method', () => {
      allowlist.addRule({
        name: 'POST Only',
        pattern: 'https://api.example.com/create',
        methods: ['POST'],
      });

      expect(allowlist.permits('https://api.example.com/create', 'POST').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/create', 'GET').allowed).toBe(false);
    });

    it('should support multiple methods', () => {
      allowlist.addRule({
        name: 'MultiMethod',
        pattern: 'https://api.example.com/resource',
        methods: ['GET', 'POST', 'PUT'],
      });

      expect(allowlist.permits('https://api.example.com/resource', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/resource', 'POST').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/resource', 'DELETE').allowed).toBe(false);
    });
  });

  describe('rate limiting', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should enforce rate limit', () => {
      allowlist.addRule({
        name: 'Rate Limited API',
        pattern: 'https://api.example.com/limited',
        methods: ['GET'],
        rateLimitPerSecond: 2,
      });

      // First two requests should succeed
      expect(allowlist.permits('https://api.example.com/limited', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/limited', 'GET').allowed).toBe(true);
      
      // Third should be rate limited
      expect(allowlist.permits('https://api.example.com/limited', 'GET').allowed).toBe(false);
      expect(allowlist.permits('https://api.example.com/limited', 'GET').reason).toContain('Rate limit');
    });

    it('should reset counter after time window', () => {
      allowlist.addRule({
        name: 'Rate Limited API',
        pattern: 'https://api.example.com/limited',
        methods: ['GET'],
        rateLimitPerSecond: 2,
      });

      // Use 2 requests
      expect(allowlist.permits('https://api.example.com/limited', 'GET').allowed).toBe(true);
      expect(allowlist.permits('https://api.example.com/limited', 'GET').allowed).toBe(true);
      
      // Advance time by 1 second
      jest.advanceTimersByTime(1000);
      
      // Should be allowed again
      expect(allowlist.permits('https://api.example.com/limited', 'GET').allowed).toBe(true);
    });
  });

  describe('validation', () => {
    it('should validate empty rules array', () => {
      allowlist.loadRules([]);
      const result = allowlist.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing pattern', () => {
      const invalidRule: EndpointRule = {
        name: 'Invalid',
        pattern: '',
        methods: ['GET'],
      };
      allowlist.addRule(invalidRule);
      
      const result = allowlist.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing pattern'))).toBe(true);
    });

    it('should detect missing methods', () => {
      const invalidRule: EndpointRule = {
        name: 'Invalid',
        pattern: 'https://example.com',
        methods: [],
      };
      allowlist.addRule(invalidRule);
      
      const result = allowlist.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing methods'))).toBe(true);
    });

    it('should detect duplicate patterns', () => {
      allowlist.addRule({
        name: 'Rule1',
        pattern: 'https://same.com/api',
        methods: ['GET'],
      });
      allowlist.addRule({
        name: 'Rule2',
        pattern: 'https://same.com/api',
        methods: ['POST'],
      });
      
      const result = allowlist.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('duplicate pattern'))).toBe(true);
    });
  });

  describe('export', () => {
    it('should export rules without internal state', () => {
      allowlist.addRule({
        name: 'Export Test',
        pattern: 'https://export.com/*',
        methods: ['GET', 'POST'],
        rateLimitPerSecond: 10,
        requiredScopes: ['exchange'],
        description: 'Test export',
      });

      const exported = allowlist.export();
      expect(exported).toHaveLength(1);
      expect(exported[0].name).toBe('Export Test');
      expect(exported[0].rateLimitPerSecond).toBe(10);
    });
  });

  describe('audit logging', () => {
    it('should log allowed and denied attempts', () => {
      const logs: string[] = [];
      const customAllowlist = new Allowlist((msg) => logs.push(msg));
      
      customAllowlist.addRule({
        name: 'Test',
        pattern: 'https://test.com/*',
        methods: ['GET'],
      });

      customAllowlist.permits('https://test.com/allowed', 'GET');
      customAllowlist.permits('https://denied.com/blocked', 'GET');

      expect(logs.some(l => l.includes('ALLOWED'))).toBe(true);
      expect(logs.some(l => l.includes('DENIED'))).toBe(true);
    });
  });

  describe('createExchangeAllowlist helper', () => {
    it('should create Binance-style rules', () => {
      const rules = createExchangeAllowlist('https://api.binance.com');
      
      expect(rules).toHaveLength(5);
      expect(rules.some(r => r.name === 'Exchange Order')).toBe(true);
      expect(rules.some(r => r.pattern.includes('/order'))).toBe(true);
      expect(rules.some(r => r.methods.includes('POST'))).toBe(true);
    });

    it('should include klines endpoint', () => {
      const rules = createExchangeAllowlist('https://api.binance.com');
      const klinesRule = rules.find(r => r.name === 'Exchange Kline/Candlestick');
      expect(klinesRule).toBeDefined();
      expect(klinesRule?.pattern).toContain('/klines');
    });
  });

  describe('global singleton', () => {
    it('should initialize singleton', async () => {
      const instance = initAllowlist([
        {
          name: 'Singleton Test',
          pattern: 'https://singleton.com/*',
          methods: ['GET'],
        },
      ]);
      expect(instance).toBeInstanceOf(Allowlist);
      
      const same = getAllowlist();
      expect(same).toBe(instance);
    });

    it('should throw if not initialized', () => {
      // Reset global state
      (getAllowlist as any).__clear?.();
      expect(() => getAllowlist()).toThrow('not initialized');
    });
  });

  describe('context logging', () => {
    it('should include skill name in logs when provided', () => {
      const logs: string[] = [];
      const customAllowlist = new Allowlist((msg) => logs.push(msg));
      
      customAllowlist.addRule({
        name: 'Test',
        pattern: 'https://test.com/*',
        methods: ['GET'],
      });

      customAllowlist.permits('https://denied.com/blocked', 'GET', { skillName: 'ExchangeAdapter' });

      expect(logs.some(l => l.includes('skill: ExchangeAdapter'))).toBe(true);
    });
  });
});
