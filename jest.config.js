/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    // Beta 发布: 排除未成熟/外部依赖重的模块
    '!src/skills/exchange/**',
    '!src/skills/risk/integration.ts',
    '!src/skills/**/integration.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 50,
      lines: 55,
      statements: 55,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/tests/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@skills/(.*)$': '<rootDir>/src/skills/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
  verbose: true,
  // Beta 发布: 暂时跳过未完成/外部依赖复杂的测试
  testPathIgnorePatterns: [
    '<rootDir>/tests/unit/integration/',  // 集成测试 (exchange + risk 集成)
    '<rootDir>/tests/unit/skills/exchange/',  // Exchange 集成测试 (需要 CCXT mock)
    '<rootDir>/tests/unit/skills/risk/integration.ts',  // Risk integration (待完善)
  ],
};
