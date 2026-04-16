/**
 * Vault - 加密凭证存储与安全注入 (Simplified for Phase 2 Sprint 2)
 *
 * IronClaw-inspired design:
 * - Secrets encrypted at rest
 * - Injected at network boundary (LLM never sees plaintext)
 * - Allowlist-based endpoint control
 *
 * Phase 2 implementation: simplified AES-256-CBC (no GCM for simplicity now)
 * Will upgrade to GCM in Phase 3 security audit.
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync, createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export enum SecretScope {
  GLOBAL = 'global',
  RESTRICTED = 'restricted',
  SKILL = 'skill'
}

interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  salt: string;
  algorithm: string;
  scope: SecretScope;
  allowedEndpoints?: string[];
}

export interface VaultConfig {
  vaultPath: string;
  masterKeyEnv?: string;
  masterKey?: string;
  keepDecryptedInMemory?: boolean;
}

export class Vault {
  private static instance: Vault | null = null;
  private config: VaultConfig;
  private secrets: Map<string, EncryptedSecret>;
  private masterKeyBuffer: Buffer | null = null;

  private constructor(config: VaultConfig) {
    this.config = {
      keepDecryptedInMemory: false,
      ...config
    };
    this.secrets = new Map();
    this.initializeVault();
  }

  static getInstance(config?: VaultConfig): Vault {
    if (!Vault.instance) {
      if (!config) throw new Error('Vault not initialized');
      Vault.instance = new Vault(config);
    }
    return Vault.instance;
  }

  static init(config: VaultConfig): Vault {
    if (!Vault.instance) {
      Vault.instance = new Vault(config);
    }
    return Vault.instance;
  }

  private initializeVault(): void {
    const vaultPath = this.config.vaultPath;

    if (existsSync(vaultPath)) {
      const data = readFileSync(vaultPath, 'utf-8');
      const encryptedList: EncryptedSecret[] = JSON.parse(data);
      encryptedList.forEach(enc => {
        this.secrets.set(this.hashKey(enc.ciphertext), enc);
      });
      console.log(`[Vault] Loaded ${this.secrets.size} secrets`);
    } else {
      this.ensureDir(vaultPath);
      writeFileSync(vaultPath, '[]', 'utf-8');
      console.log(`[Vault] Created new vault`);
    }

    this.deriveMasterKey();
  }

  private ensureDir(filePath: string): void {
    const dir = require('path').dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private deriveMasterKey(): void {
    let source = this.config.masterKey || (this.config.masterKeyEnv && process.env[this.config.masterKeyEnv!]);
    if (!source) throw new Error('Vault: master key not provided');

    // Use PBKDF2 to derive 32-byte key
    this.masterKeyBuffer = pbkdf2Sync(source, 'openclaw-quant-salt', 100000, 32, 'sha256');
    console.log('[Vault] Master key derived');
  }

  private hashKey(secret: string): string {
    return createHash('sha256').update(secret).digest('hex').substring(0, 16);
  }

  private encrypt(plaintext: string): { ciphertext: string; iv: string } {
    if (!this.masterKeyBuffer) throw new Error('Vault: master key not initialized');

    const iv = randomBytes(16); // CBC mode 需要 16 bytes IV
    const cipher = createCipheriv('aes-256-cbc', this.masterKeyBuffer, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    return {
      ciphertext: encrypted,
      iv: iv.toString('base64')
    };
  }

  private decrypt(ciphertextB64: string, ivB64: string): string {
    if (!this.masterKeyBuffer) throw new Error('Vault: master key not initialized');

    const iv = Buffer.from(ivB64, 'base64');
    const decipher = createDecipheriv('aes-256-cbc', this.masterKeyBuffer, iv);
    
    let decrypted = decipher.update(ciphertextB64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  async store(key: string, value: string, scope: SecretScope = SecretScope.GLOBAL, allowedEndpoints?: string[]): Promise<void> {
    if (this.secrets.has(key)) {
      throw new Error(`Vault: Secret "${key}" already exists`);
    }

    const { ciphertext, iv } = this.encrypt(value);
    const salt = randomBytes(16).toString('base64');

    const encrypted: EncryptedSecret = {
      ciphertext,
      iv,
      salt,
      algorithm: 'aes-256-cbc',
      scope,
      ...(scope === SecretScope.RESTRICTED && allowedEndpoints ? { allowedEndpoints } : {})
    };

    this.secrets.set(key, encrypted); // 使用 key 作为索引 (简化)
    await this.persist();
    console.log(`[Vault] Stored secret: ${key}`);
  }

  async retrieve(key: string): Promise<string> {
    const enc = this.secrets.get(key);
    if (!enc) throw new Error(`Vault: Secret "${key}" not found`);
    return this.decrypt(enc.ciphertext, enc.iv);
  }

  async inject(key: string, request: { setAuthHeader?: (k: string, v: string) => void }, endpoint?: string): Promise<void> {
    const enc = this.secrets.get(key);
    if (!enc) throw new Error(`Vault: Secret "${key}" not found`);

    if (enc.scope === SecretScope.RESTRICTED && endpoint) {
      const allowed = enc.allowedEndpoints || [];
      const isAllowed = allowed.some(pattern => this.matchUrl(pattern, endpoint));
      if (!isAllowed) {
        throw new Error(`Vault: Endpoint "${endpoint}" not allowed for secret "${key}"`);
      }
    }

    const value = this.decrypt(enc.ciphertext, enc.iv);

    if (request.setAuthHeader) {
      request.setAuthHeader('Authorization', `Bearer ${value}`);
    } else if ((request as any).headers) {
      (request as any).headers['Authorization'] = `Bearer ${value}`;
    } else {
      throw new Error('Vault: Request must have setAuthHeader or headers');
    }
  }

  private matchUrl(pattern: string, url: string): boolean {
    let regex = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                       .replace(/\*/g, '[^/?]+')
                       .replace(/\*\*/g, '.*')
                       .replace(/\?/g, '.');
    regex = `^${regex}$`;
    return new RegExp(regex).test(url);
  }

  async rotate(key: string, newValue: string): Promise<void> {
    if (!this.secrets.has(key)) throw new Error(`Vault: Secret "${key}" not found`);
    await this.store(key, newValue, this.secrets.get(key)!.scope, this.secrets.get(key)!.allowedEndpoints);
  }

  async delete(key: string): Promise<void> {
    if (!this.secrets.delete(key)) throw new Error(`Vault: Secret "${key}" not found`);
    await this.persist();
  }

  list(): Array<{ key: string; scope: SecretScope; allowedEndpoints?: string[] }> {
    return Array.from(this.secrets.keys()).map(k => {
      const enc = this.secrets.get(k)!;
      return { key: k, scope: enc.scope, allowedEndpoints: enc.allowedEndpoints };
    });
  }

  private async persist(): Promise<void> {
    const list = Array.from(this.secrets.values());
    writeFileSync(this.config.vaultPath, JSON.stringify(list, null, 2), 'utf-8');
  }

  clearMemory(): void {
    if (this.masterKeyBuffer) {
      this.masterKeyBuffer.fill(0);
      this.masterKeyBuffer = null;
    }
  }
}

export function getVault(): Vault {
  const vaultPath = process.env.OPENCLAW_QUANT_VAULT_PATH || join(process.env.HOME || '.', '.openclaw', 'vault.json');
  const masterKey = process.env.OPENCLAW_QUANT_VAULT_KEY;
  if (!masterKey) throw new Error('Vault: OPENCLAW_QUANT_VAULT_KEY required');
  return Vault.init({ vaultPath, masterKey, keepDecryptedInMemory: false });
}
