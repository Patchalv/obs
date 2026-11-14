import { defineConfig } from 'vitest/config';

// Two projects. `unit` needs no database. `integration` (*.int.test.ts) runs against the
// docker compose Postgres and PgBouncer: run `pnpm db:up` first.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'apps/*/src/**/*.test.{ts,tsx}',
            'packages/*/src/**/*.test.ts',
            'scripts/**/*.test.ts',
            '.claude/hooks/**/*.test.ts',
          ],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/server/src/**/*.int.test.ts'],
          globalSetup: ['apps/server/src/test/global-setup.ts'],
          setupFiles: ['apps/server/src/test/worker-setup.ts'],
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
