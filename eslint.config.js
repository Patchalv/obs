// ESLint holds only the type-aware rules Biome can't check. Everything else is Biome's job.
// The main job is protecting the transaction wrapper: an unawaited query can escape
// the app.staff_id transaction.
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig({
  files: [
    'apps/*/src/**/*.{ts,tsx}',
    'packages/*/src/**/*.ts',
    'scripts/**/*.ts',
    '.claude/hooks/**/*.ts',
  ],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    '@typescript-eslint': tseslint.plugin,
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/switch-exhaustiveness-check': 'error',
  },
});
