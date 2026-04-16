/**
 * Logger fixtures
 */

export const loggerOptions = {
  level: 'info' as const,
  format: 'json' as const,
  output: 'console' as const,
  filePath: 'logs/test.log',
  maxFiles: 1,
  maxsize: 1024
};

export const logMessages = [
  { level: 'trace', message: 'Trace message', meta: { traceId: '123' } },
  { level: 'debug', message: 'Debug info', meta: { component: 'test' } },
  { level: 'info', message: 'Info message', meta: { user: 'test' } },
  { level: 'warn', message: 'Warning!', meta: { risk: 'high' } },
  { level: 'error', message: 'Error!', error: new Error('Test error'), meta: { code: 500 } },
  { level: 'fatal', message: 'Fatal!', error: new Error('Fatal error'), meta: { critical: true } }
];

export const logContext = 'test-module';
