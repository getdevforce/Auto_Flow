import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
    // Core logic only: UI components are covered by the Playwright suite, and the service-worker runner and pipeline by its end-to-end runs.
    coverage: { provider: 'v8', include: ['src/vault/**', 'src/api-base.ts', 'src/projects.ts', 'src/library/**', 'src/entitlements.ts', 'src/runs.ts', 'src/draft.ts', 'src/autopilot/llm-cache.ts'], exclude: ['src/**/*.test.ts', 'src/test/**'], thresholds: { lines: 75, statements: 75, functions: 70 } },
  },
});
