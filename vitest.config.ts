import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{ts,js}',
        '**/types.ts',
        '**/*.d.ts'
      ]
    },
    exclude: ['**/node_modules/**', '**/dist/**', 'archive/**', '**/sqlite.test.ts', '**/task-queue-cascade.test.ts'],
    mockReset: true,
    restoreMocks: true,
  },
});
