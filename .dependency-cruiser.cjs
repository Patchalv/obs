// Boundary rules from the conventions decision (issue #19). Some paths don't exist yet;
// the rules are in place before the code that they guard.
//
// - The ping_app pool and every raw database driver live in apps/server/src/db/.
// - The ping_system pool is created in apps/server/src/db/system-pool.ts and only
//   apps/server/src/system-actions/ may import it (ADR 0004).

/**
 * Packages that open a raw Postgres connection. Matches the bare name (not installed yet)
 * and pnpm's resolved path (node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/...).
 */
const DATABASE_DRIVERS =
  '(^|node_modules/)(pg|pg-pool|postgres|@neondatabase/serverless|drizzle-orm/(node-postgres|postgres-js|neon-http|neon-serverless))(/|$)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-raw-db-outside-db',
      comment:
        'Only apps/server/src/db/ opens database connections. Everything else goes through withStaffTx() or system-actions/.',
      severity: 'error',
      from: { pathNot: '^apps/server/src/db/' },
      to: { path: DATABASE_DRIVERS },
    },
    {
      name: 'ping-system-pool-only-in-system-actions',
      comment: 'Only apps/server/src/system-actions/ may use the ping_system pool (ADR 0004).',
      severity: 'error',
      from: { pathNot: '^apps/server/src/system-actions/' },
      to: { path: '^apps/server/src/db/system-pool' },
    },
    {
      name: 'web-imports-server-types-only',
      comment:
        'apps/web reaches the server only through `import type` (Hono RPC AppType). Never import server code at runtime.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/server/', dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'shared-never-imports-server',
      comment: 'packages/shared is imported by both apps, so it must never depend on server code.',
      severity: 'error',
      from: { path: '^packages/shared/' },
      to: { path: '^apps/server/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^apps/[^/]+/dist/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
