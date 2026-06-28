import type { Config } from 'jest';

const config: Config = {
  automock: false,
  clearMocks: true,
  collectCoverage: true,
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/index.ts',
    '!<rootDir>/src/**/types.ts',
    '!<rootDir>/src/landingTemplate.ts',
    '!<rootDir>/src/utils/quality.ts',
    '!<rootDir>/src/utils/hls.ts',
    '!<rootDir>/src/utils/media-flow-proxy.ts',
    '!<rootDir>/src/utils/StreamResolver.ts',
    '!<rootDir>/src/utils/dispatcher.ts',
    '!<rootDir>/src/extractor/Voe.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coveragePathIgnorePatterns: [
    '/src/controller/',
    '/src/utils/dispatcher.ts',
    '/src/utils/quality.ts',
    '/src/utils/hls.ts',
    '/src/utils/mediaflow-proxy.ts',
    '/src/utils/StreamResolver.ts',
    '/src/extractor/Voe.ts',
  ],
  coverageProvider: 'babel',
  coverageThreshold: {
    global: {
      branches: 99.9,
      functions: 100,
      lines: 99.9,
      statements: 99.9,
    },
  },
  resetModules: true,
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: 'node',
  testEnvironmentOptions: {
    globalsCleanup: 'on',
  },
  transform: {
    '^.+.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.dev.json',
    }],
  },
  modulePathIgnorePatterns: [
    '<rootDir>/dist',
  ],
};

export default config;
