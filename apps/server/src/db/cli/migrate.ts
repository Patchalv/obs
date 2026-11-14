// `pnpm db:migrate`: applies migrations as the owner role (MIGRATION_DATABASE_URL).
// Locally it also gives ping_app and ping_system their known local passwords. Hosted
// environments (NODE_ENV=production) set role passwords out of band.
import { LOCAL_ROLE_PASSWORDS, loadEnvLocal, migrationDatabaseUrl } from '../../config';
import { ensureDatabase, runMigrations } from '../migrate';

loadEnvLocal();
const ownerUrl = migrationDatabaseUrl();
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  await ensureDatabase(ownerUrl, new URL(ownerUrl).pathname.slice(1));
}
await runMigrations(ownerUrl, isProduction ? {} : { rolePasswords: LOCAL_ROLE_PASSWORDS });
console.log('Migrations applied.');
