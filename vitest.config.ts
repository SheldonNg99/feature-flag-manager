import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    env: {
      DATABASE_URL: 'postgresql://ffm:password@localhost:5432/feature_flags',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long-for-testing',
      JWT_EXPIRES_IN: '24h',
      NODE_ENV: 'test',
      API_KEY_SALT_ROUNDS: '4',
      LOG_LEVEL: 'error',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
