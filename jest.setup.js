// Jest 测试全局设置

// 扩展 expect 断言
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} to ${ceiling}`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} to ${ceiling}`,
        pass: false
      };
    }
  }
});

// 全局错误处理
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection at:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// 测试环境变量
process.env.NODE_ENV = 'test';
process.env.OPENCLAW_QUANT_LOGGING_LEVEL = 'error';
