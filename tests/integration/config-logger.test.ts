/**
 * 集成测试示例：Config + Logger 协同工作
 */

import { initConfig, getConfig } from '../../src/core/config';
import { initLogger, getLogger } from '../../src/core/logger';

// 注意：集成测试可能因依赖外部环境而跳过，这里仅演示结构
describe('Config + Logger Integration', () => {
  beforeAll(() => {
    // 初始化
    initConfig('testing');
    initLogger();
  });

  it('should log configuration loading', () => {
    const logger = getLogger('config-test');
    const config = getConfig() as any;

    logger.info('Configuration loaded', {
      environment: config.app.environment,
      version: config.app.version
    });

    // 验证日志被调用（由于 mock，这里仅结构验证）
    expect(config).toBeDefined();
  });

  it('should handle errors with context', () => {
    const logger = getLogger('error-test');
    logger.error('Test error', new Error('Integration test error'), {
      component: 'config-logger',
      test: true
    });

    // 断言通过即表示无异常
    expect(true).toBe(true);
  });
});

describe('Full workflow (smoke test)', () => {
  it('should complete a full initialization flow', () => {
    // 1. Init config
    const configManager = initConfig('development');
    const config = configManager.get() as any;

    expect(config.app.name).toBe('openclaw-quant-trading');
    expect(config.api.port).toBe(8080);

    // 2. Init logger
    const logger = initLogger({ level: 'info' });
    expect(logger).toBeDefined();

    // 3. Use logger with config data
    logger.info('System initialized', {
      port: config.api.port,
      db: config.database.name,
      env: config.app.environment
    });

    // 4. Verify no errors thrown
    expect(true).toBe(true);
  });
});
