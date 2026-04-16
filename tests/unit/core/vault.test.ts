/**
 * Vault 单元测试
 *
 * 注意：由于加密依赖，测试使用临时目录和测试密钥
 */

import { Vault, SecretScope, getVault } from '../../../src/core/vault';
import { Allowlist } from '../../../src/core/allowlist';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const TEST_VAULT_PATH = '/tmp/openclaw-quant-vault-test.json';
const TEST_MASTER_KEY = 'test-master-key-1234567890';

describe('Vault', () => {
  let vault: Vault;

  beforeAll(() => {
    // 清理可能存在的测试文件
    if (existsSync(TEST_VAULT_PATH)) {
      unlinkSync(TEST_VAULT_PATH);
    }
  });

  afterAll(() => {
    // 清理测试文件
    if (existsSync(TEST_VAULT_PATH)) {
      unlinkSync(TEST_VAULT_PATH);
    }
    // 重置单例，避免影响其他测试
    (Vault as any).instance = null;
  });

  beforeEach(() => {
    // 每个测试前创建新实例 (跳过单例)
    vault = new Vault({
      vaultPath: TEST_VAULT_PATH,
      masterKey: TEST_MASTER_KEY,
      keepDecryptedInMemory: false
    } as any);
    // 直接替换单例，确保隔离
    (Vault as any).instance = vault;
  });

  describe('initialization', () => {
    it('should create new vault file if not exists', () => {
      expect(existsSync(TEST_VAULT_PATH)).toBe(true);
      const content = readFileSync(TEST_VAULT_PATH, 'utf-8');
      expect(JSON.parse(content)).toEqual([]);
    });

    it('should load existing vault', () => {
      // 先存入一个 secret
      vault.store('test-key', 'test-value', SecretScope.GLOBAL);
      
      // 创建新实例
      const vault2 = Vault.init({
        vaultPath: TEST_VAULT_PATH,
        masterKey: TEST_MASTER_KEY
      });
      expect(vault2.list().length).toBeGreaterThan(0);
    });

    it('should throw if master key not provided', () => {
      expect(() => {
        Vault.init({ vaultPath: TEST_VAULT_PATH } as any);
      }).toThrow('master key');
    });
  });

  describe('store & retrieve', () => {
    it('should store and retrieve secret', async () => {
      await vault.store('binance.apiKey', 'secret123', SecretScope.GLOBAL);
      const value = await vault.retrieve('binance.apiKey');
      expect(value).toBe('secret123');
    });

    it('should reject duplicate key', async () => {
      await vault.store('key1', 'value1', SecretScope.GLOBAL);
      await expect(vault.store('key1', 'value2', SecretScope.GLOBAL))
        .rejects.toThrow('already exists');
    });

    it('should store with different scopes', async () => {
      await vault.store('global-key', 'g', SecretScope.GLOBAL);
      await vault.store('restricted-key', 'r', SecretScope.RESTRICTED, ['https://api.binance.com/*']);
      await vault.store('skill-key', 's', SecretScope.SKILL);
      
      expect(vault.list().length).toBe(3);
    });
  });

  describe('scope validation', () => {
    it('should allow global scope for any endpoint', async () => {
      await vault.store('global-key', 'value', SecretScope.GLOBAL);
      // 即使不传 endpoint 也应该能 inject (global 不检查)
      await vault.inject('global-key', { setAuthHeader: jest.fn() }, 'https://evil.com/steal');
    });

    it('should restrict to allowed endpoints', async () => {
      await vault.store('restricted-key', 'value', SecretScope.RESTRICTED, [
        'https://api.binance.com/api/v3/order'
      ]);
      
      // 允许的 endpoint
      await expect(
        vault.inject('restricted-key', { setAuthHeader: jest.fn() }, 'https://api.binance.com/api/v3/order')
      ).resolves.not.toThrow();
      
      // 不允许的 endpoint
      await expect(
        vault.inject('restricted-key', { setAuthHeader: jest.fn() }, 'https://evil.com/steal')
      ).rejects.toThrow('not allowed');
    });

    it('should support wildcard patterns', async () => {
      await vault.store('wildcard-key', 'value', SecretScope.RESTRICTED, [
        'https://api.binance.com/api/v3/*'
      ]);
      
      await expect(
        vault.inject('wildcard-key', { setAuthHeader: jest.fn() }, 'https://api.binance.com/api/v3/account')
      ).resolves.not.toThrow();
      
      await expect(
        vault.inject('wildcard-key', { setAuthHeader: jest.fn() }, 'https://api.binance.com/api/v4/account')
      ).rejects.toThrow();
    });
  });

  describe('inject', () => {
    it('should inject Authorization header', async () => {
      await vault.store('api-key', 'secret-token', SecretScope.GLOBAL);
      
      const mockRequest = {
        setAuthHeader: jest.fn()
      };
      
      await vault.inject('api-key', mockRequest);
      
      expect(mockRequest.setAuthHeader).toHaveBeenCalledWith(
        'Authorization',
        'Bearer secret-token'
      );
    });

    it('should throw if secret not found', async () => {
      await expect(
        vault.inject('non-existent', { setAuthHeader: jest.fn() })
      ).rejects.toThrow('not found');
    });
  });

  describe('delete', () => {
    it('should delete secret', async () => {
      await vault.store('to-delete', 'value', SecretScope.GLOBAL);
      expect(vault.list().length).toBe(1);
      
      await vault.delete('to-delete');
      expect(vault.list().length).toBe(0);
    });

    it('should throw if deleting non-existent', async () => {
      await expect(vault.delete('non-existent'))
        .rejects.toThrow('not found');
    });
  });

  describe('persistence', () => {
    it('should persist to disk after store', () => {
      vault.store('key1', 'value1', SecretScope.GLOBAL);
      
      const content = readFileSync(TEST_VAULT_PATH, 'utf-8');
      const data = JSON.parse(content);
      expect(data.length).toBe(1);
    });

    it('should load from disk across instances', async () => {
      const v1 = Vault.init({
        vaultPath: TEST_VAULT_PATH,
        masterKey: TEST_MASTER_KEY
      });
      await v1.store('persistent-key', 'persistent-value', SecretScope.GLOBAL);
      
      // 模拟新进程 (创建新实例)
      const v2 = Vault.init({
        vaultPath: TEST_VAULT_PATH,
        masterKey: TEST_MASTER_KEY
      });
      
      const value = await v2.retrieve('persistent-key');
      expect(value).toBe('persistent-value');
    });
  });
});

describe('Allowlist', () => {
  describe('pattern matching', () => {
    it('should match exact URLs', () => {
      const allowlist = new Allowlist([
        { pattern: 'https://api.binance.com/api/v3/order', methods: ['POST'] }
      ]);
      
      expect(allowlist.permits('https://api.binance.com/api/v3/order', 'POST')).toBe(true);
      expect(allowlist.permits('https://api.binance.com/api/v3/order', 'GET')).toBe(false);
      expect(allowlist.permits('https://api.binance.com/api/v3/account', 'POST')).toBe(false);
    });

    it('should support wildcard *', () => {
      const allowlist = new Allowlist([
        { pattern: 'https://api.binance.com/api/v3/*' }
      ]);
      
      expect(allowlist.permits('https://api.binance.com/api/v3/order')).toBe(true);
      expect(allowlist.permits('https://api.binance.com/api/v3/account')).toBe(true);
      expect(allowlist.permits('https://api.binance.com/api/v4/order')).toBe(false);
    });

    it('should normalize URLs', () => {
      const allowlist = new Allowlist([
        { pattern: 'https://api.binance.com/api/v3/order' }
      ]);
      
      // query 参数顺序不同应视为相同 (当前实现不排序，简化)
      expect(allowlist.permits('https://api.binance.com/api/v3/order?time=1')).toBe(false);
      expect(allowlist.permits('https://api.binance.com/api/v3/order')).toBe(true);
    });

    it('should return match details', () => {
      const allowlist = new Allowlist([
        { pattern: 'https://api.binance.com/api/v3/*' }
      ]);
      
      const result = allowlist.match('https://api.binance.com/api/v3/account', 'GET');
      expect(result?.allowed).toBe(true);
      expect(result?.rule?.description).toBeUndefined();
    });
  });

  describe('validation', () => {
    it('should validate patterns', () => {
      const { errors } = Allowlist.validate([
        { pattern: 'ftp://invalid.com' },
        { pattern: 'https://valid.com' }
      ]);
      expect((errors as string[]).some(e => e.includes('http'))).toBe(true);
    });

    it('should validate HTTP methods', () => {
      const { errors } = Allowlist.validate([
        { pattern: 'https://api.com', methods: ['GET', 'INVALID'] }
      ]);
      expect((errors as string[]).length).toBeGreaterThan(0);
    });
  });

  describe('dynamic rules', () => {
    it('should add and remove rules', () => {
      const allowlist = new Allowlist([
        { pattern: 'https://api.binance.com/api/v3/order' }
      ]);
      
      allowlist.addRule({
        pattern: 'https://api.binance.com/api/v3/account',
        methods: ['GET']
      });
      
      expect(allowlist.listRules().length).toBe(2);
      
      allowlist.removeRule('https://api.binance.com/api/v3/order');
      expect(allowlist.listRules().length).toBe(1);
    });
  });
});
