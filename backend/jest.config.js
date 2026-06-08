/**
 * Jest 配置文件
 * 使用 Node.js 原生 ESM 支持
 * 运行命令: node --experimental-vm-modules node_modules/jest/bin/jest.js
 */
export default {
  // 不做代码转换，依赖 Node.js 原生 ESM
  transform: {},

  // 测试文件匹配模式
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js',
  ],

  // 测试环境
  testEnvironment: 'node',

  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json'],

  // 覆盖率配置
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/app.js',
    '!node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover'],

  // 测试超时（属性测试可能需要更长时间）
  testTimeout: 30000,

  // 测试路径忽略
  testPathIgnorePatterns: ['/node_modules/'],

  // 清除 mock
  clearMocks: true,
  restoreMocks: true,

  // ESM 支持: 需要 --experimental-vm-modules 标志
  // 将 .js 文件视为 ESM（配合 package.json "type": "module"）
  extensionsToTreatAsEsm: [],
};
