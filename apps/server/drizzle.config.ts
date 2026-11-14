import { defineConfig } from 'drizzle-kit';

// drizzle-kit only generates migration SQL from the schema. Migrations are applied by
// `pnpm db:migrate`, which runs as the owner role.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
