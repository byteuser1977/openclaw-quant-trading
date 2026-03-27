import { Vault, getVault } from '../core/vault';
import { Allowlist, getAllowlist, createExchangeAllowlist } from '../core/allowlist';

/**
 * Exchange Adapter - 交易所适配器（集成 Vault + Allowlist 示例）
 * 
 * 展示了如何安全地管理 API Key，而不将密钥暴露给策略代码
 */
export interface ExchangeConfig {
  name: string;
  baseUrl: string;
  apiKeyVaultKey: string;  // Vault 中的密钥名称，而非实际密钥
  secretKeyVaultKey: string;
}

export class ExchangeAdapter {
  private vault: Vault;
  private allowlist: Allowlist;
  private config: ExchangeConfig;

  constructor(config: ExchangeConfig) {
    this.config = config;
    this.vault = getVault();
    
    // 为当前交易所创建 Allowlist 规则
    const rules = createExchangeAllowlist(config.baseUrl);
    this.allowlist = new Allowlist((msg) => {
      console.log(`[Exchange:${config.name}] ${msg}`);
    });
    this.allowlist.loadRules(rules);
  }

  /**
   * 连接到交易所 - 自动从 Vault 获取密钥
   */
  async connect(): Promise<{ connected: boolean; error?: string }> {
    try {
      // 检查是否允许访问该端点
      const check = this.allowlist.permits(
        `${this.config.baseUrl}/api/v3/account`,
        'GET',
        { skillName: 'ExchangeAdapter' }
      );
      
      if (!check.allowed) {
        return { connected: false, error: `Access denied: ${check.reason}` };
      }

      // 从 Vault 获取 API Key（解密）
      const apiKey = await this.vault.decrypt(this.config.apiKeyVaultKey, {
        purpose: 'connect_exchange',
        url: `${this.config.baseUrl}/api/v3/account`,
      });

      const secretKey = await this.vault.decrypt(this.config.secretKeyVaultKey, {
        purpose: 'connect_exchange',
        url: `${this.config.baseUrl}/api/v3/account`,
      });

      console.log(`[Exchange:${this.config.name}] Connected successfully`);
      console.log(`[Exchange:${this.config.name}] API Key: ${apiKey.substring(0, 4)}****`);

      return { connected: true };
    } catch (error) {
      return { 
        connected: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * 下单 - 自动注入密钥到请求
   */
  async createOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'LIMIT' | 'MARKET';
    quantity: number;
    price?: number;
  }): Promise<{ orderId?: string; error?: string }> {
    const orderUrl = `${this.config.baseUrl}/api/v3/order`;
    
    // 检查 Allowlist
    const check = this.allowlist.permits(orderUrl, 'POST', { skillName: 'ExchangeAdapter' });
    if (!check.allowed) {
      return { error: `Order rejected: ${check.reason}` };
    }

    try {
      // 从 Vault 获取密钥（自动解密）
      const apiKey = await this.vault.decrypt(this.config.apiKeyVaultKey, {
        purpose: 'create_order',
        url: orderUrl,
      });

      const secretKey = await this.vault.decrypt(this.config.secretKeyVaultKey, {
        purpose: 'create_order',
        url: orderUrl,
      });

      // 这里会构造签名并发送请求
      console.log(`[Exchange:${this.config.name}] Order created:`, {
        ...params,
        apiKeyPrefix: apiKey.substring(0, 4),
      });

      return { orderId: `mock_${Date.now()}` };
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : 'Order failed' 
      };
    }
  }

  /**
   * 获取账户余额
   */
  async getBalance(): Promise<{ balances?: Record<string, number>; error?: string }> {
    const url = `${this.config.baseUrl}/api/v3/account`;
    
    const check = this.allowlist.permits(url, 'GET', { skillName: 'ExchangeAdapter' });
    if (!check.allowed) {
      return { error: `Access denied: ${check.reason}` };
    }

    try {
      const apiKey = await this.vault.decrypt(this.config.apiKeyVaultKey, {
        purpose: 'get_balance',
        url,
      });

      console.log(`[Exchange:${this.config.name}] Balance fetched`);
      
      // Mock 返回
      return {
        balances: {
          BTC: 1.5,
          ETH: 10.0,
          USDT: 50000,
        },
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to get balance' };
    }
  }
}

/**
 * 创建 Binance 交易所适配器
 */
export async function createBinanceAdapter(): Promise<ExchangeAdapter> {
  // 注意：这里只传递 Vault 中的密钥名称，而非实际密钥
  return new ExchangeAdapter({
    name: 'Binance',
    baseUrl: 'https://api.binance.com',
    apiKeyVaultKey: 'binance_api_key',
    secretKeyVaultKey: 'binance_secret_key',
  });
}

/**
 * 初始化示例：存储密钥到 Vault
 */
export async function initializeExchangeSecrets(): Promise<void> {
  const vault = getVault();
  
  // 存储密钥（实际生产环境中，这些应该来自环境变量或安全存储）
  await vault.store(
    'binance_api_key',
    process.env.BINANCE_API_KEY || 'demo_api_key_12345',
    'exchange' as any,
    {
      allowedPatterns: ['https://api.binance.com/api/*'],
    }
  );

  await vault.store(
    'binance_secret_key',
    process.env.BINANCE_SECRET_KEY || 'demo_secret_key_67890',
    'exchange' as any,
    {
      allowedPatterns: ['https://api.binance.com/api/*'],
    }
  );

  console.log('[Exchange] Secrets initialized in Vault');
}
