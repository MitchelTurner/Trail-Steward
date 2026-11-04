import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    fileParallelism: false,
    hookTimeout: 120000,
    testTimeout: 120000,
    setupFiles: ['./test/setup.ts'],
  },
});
