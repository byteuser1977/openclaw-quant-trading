import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * 密钥作用域 - 限制密钥可访问的端点
 */
export enum SecretScope {
  /** 仅限交易所 API */
  EXCHANGE = 'exchange',
  /** 仅限数据库连接 */
  DATABASE = 'database',
  /** 仅限通知服务 */
  NOTIFICATION = 'notification',
  /** 全局可用（谨慎使用） */
  GLOBAL = 'global',
}

/**
 * 加密密钥包装器
 */
interface EncryptedSecret {
  ciphertext: string;  // Base64 加密数据
  iv: string;          // 初始化向量
  authTag: string;     // GCM 认证标签
  algorithm: string;   // 算法标识
}

/**
 * 密钥元数据
 */
interface SecretMetadata {
  key: string;
  scope: SecretScope;
  allowedPatterns: string[];  // 允许的 URL 模式（wildcard）
  created_at: number;
  last_used_at?: number;
  rotate_after_days?: number;
}

/**
 * Vault - 加密密钥管理器
 *
 * 设计目标:
 * 1. LLM 永远无法看到明文密钥
 * 2. 密钥按作用域隔离
 * 3. 仅在网络边界注入（不暴露给策略代码）
 * 4. 支持密钥轮换
 *
 * 参考 IronClaw Encrypted Vault 设计
 */
export class Vault {
  private secrets: Map<string, { meta: SecretMetadata; encrypted: EncryptedSecret }>;
  private masterKey: Uint8Array;
  private keyRotationInterval?: NodeJS.Timeout;

  constructor() {
    this.secrets = new Map();
    const masterKeyHex = process.env.OPENCLAW_QUANT_MASTER_KEY;
    if (!masterKeyHex) {
      throw new Error('OPENCLAW_QUANT_MASTER_KEY environment variable is required');
    }
    this.masterKey = Buffer.from(masterKeyHex, 'hex');
  }

  /**
   * 初始化 Vault - 加载已存储的密钥
   */
  async initialize(): Promise<void> {
    // TODO: 从持久化存储加载加密的密钥元数据
    // 目前仅内存存储，生产环境需要持久化到文件/数据库
    console.log('[Vault] Initialized with master key');
  }

  /**
   * 存储密钥（加密）
   */
  async store(
    key: string,
    plaintext: string,
    scope: SecretScope,
    options: {
      allowedPatterns?: string[];
      rotateAfterDays?: number;
    } = {}
  ): Promise<void> {
    // 生成随机 IV
    const iv = randomBytes(12);
    
    // AES-256-GCM 加密
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    const encryptedSecret: EncryptedSecret = {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      algorithm: 'AES-256-GCM',
    };

    const meta: SecretMetadata = {
      key,
      scope,
      allowedPatterns: options.allowedPatterns ?? [],
      created_at: Date.now(),
      rotate_after_days: options.rotateAfterDays ?? 30,
    };

    this.secrets.set(key, { meta, encrypted: encryptedSecret });
    
    // TODO: 持久化到存储
    console.log(`[Vault] Stored secret: ${key} (scope: ${scope})`);
  }

  /**
   * 解密并获取密钥（仅在允许的上下文中）
   */
  async decrypt(
    key: string,
    context: {
      url?: string;      // 当前请求的 URL（用于作用域检查）
      purpose: string;   // 使用目的（审计用）
    }
  ): Promise<string> {
    const entry = this.secrets.get(key);
    if (!entry) {
      throw new Error(`Secret ${key} not found in vault`);
    }

    // 检查作用域
    if (context.url && entry.meta.allowedPatterns.length > 0) {
      const allowed = this.matchPatterns(context.url, entry.meta.allowedPatterns);
      if (!allowed) {
        throw new Error(`Secret ${key} not allowed for URL: ${context.url}`);
      }
    }

    // 解密
    const iv = Buffer.from(entry.encrypted.iv, 'hex');
    const authTag = Buffer.from(entry.encrypted.authTag, 'hex');
    const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(entry.encrypted.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // 更新使用记录
    entry.meta.last_used_at = Date.now();

    console.log(`[Vault] Decrypted secret: ${key} (purpose: ${context.purpose})`);
    return decrypted;
  }

  /**
   * 删除密钥
   */
  async delete(key: string): Promise<boolean> {
    const deleted = this.secrets.delete(key);
    if (deleted) {
      console.log(`[Vault] Deleted secret: ${key}`);
      // TODO: 从持久化存储删除
    }
    return deleted;
  }

  /**
   * 列出所有密钥（仅元数据，不解密）
   */
  listKeys(): SecretMetadata[] {
    return Array.from(this.secrets.values()).map(entry => entry.meta);
  }

  /**
   * 检查密钥是否需要轮换
   */
  needsRotation(key: string): boolean {
    const entry = this.secrets.get(key);
    if (!entry) return false;
    const { created_at, rotate_after_days } = entry.meta;
    if (!rotate_after_days) return false;
    const ageDays = (Date.now() - created_at) / (1000 * 60 * 60 * 24);
    return ageDays >= rotate_after_days;
  }

  /**
   * 轮换密钥（删除旧密钥，存储新密钥）
   */
  async rotate(
    key: string,
    newPlaintext: string,
    options?: { allowedPatterns?: string[]; rotateAfterDays?: number }
  ): Promise<void> {
    console.log(`[Vault] Rotating secret: ${key}`);
    await this.delete(key);
    await this.store(key, newPlaintext, SecretScope.GLOBAL, options);
  }

  /**
   * 启动自动轮换任务
   */
  startAutoRotation(intervalHours: number = 24): void {
    this.keyRotationInterval = setInterval(async () => {
      for (const [key] of this.secrets) {
        if (this.needsRotation(key)) {
          console.warn(`[Vault] Secret ${key} needs rotation`);
          // TODO: 触发告警或自动调用 rotate API
        }
      }
    }, intervalHours * 60 * 60 * 1000);
  }

  /**
   * 停止自动轮换
   */
  stopAutoRotation(): void {
    if (this.keyRotationInterval) {
      clearInterval(this.keyRotationInterval);
    }
  }

  /**
   * URL 模式匹配（支持 wildcard）
   */
  private matchPatterns(url: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // 简单 wildcard 匹配：* 匹配任意字符序列
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      return regex.test(url);
    });
  }

  /**
   * 导出 Vault 状态（用于调试）
   */
  exportStatus(): { keyCount: number; keys: SecretMetadata[] } {
    return {
      keyCount: this.secrets.size,
      keys: this.listKeys(),
    };
  }
}

/**
 * 全局 Vault 实例（单例）
 */
let globalVault: Vault | null = null;

export async function initVault(): Promise<Vault> {
  if (!globalVault) {
    globalVault = new Vault();
    await globalVault.initialize();
    globalVault.startAutoRotation(24);
  }
  return globalVault;
}

export function getVault(): Vault {
  if (!globalVault) {
    throw new Error('Vault not initialized. Call initVault() first.');
  }
  return globalVault;
}
