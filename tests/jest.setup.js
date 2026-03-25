// Jest setup file

// Extend expect with custom matchers
expect.extend({
  toBeValidParameterSpace(received) {
    const pass = typeof received === 'object' && !Array.isArray(received);
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid parameter space`,
        pass: true,
      };
    }
    return {
      message: () => `expected ${received} to be a valid parameter space`,
      pass: false,
    };
  },

  toCompileStrategy(received) {
    const pass = typeof received.code === 'string' && received.code.includes('class');
    if (pass) {
      return {
        message: () => `expected strategy to compile successfully`,
        pass: true,
      };
    }
    return {
      message: () => `expected strategy to compile, but got invalid output`,
      pass: false,
    };
  },
});

// Mock winston logger
global.winston = {
  format: {
    json: () => ({}),
    prettyPrint: () => ({}),
    combine: () => ({ toString: () => '' }),
    timestamp: () => ({}),
    colorize: () => ({})
  },
  createLogger: () => ({
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  }),
  transports: {
    Console: class {},
    File: class {},
  },
};

// Mock config
jest.mock('../src/core/config', () => ({
  getConfig: () => ({
    logging: {
      level: 'info',
      format: 'json',
      output: 'console',
      logDir: 'logs',
      maxFiles: 10,
      maxSizeMB: 10,
    },
  }),
}));

// Silence console logs during tests (optional)
if (process.env.NODE_ENV !== 'test') {
  console.warn('Running tests with NODE_ENV !== test');
}
