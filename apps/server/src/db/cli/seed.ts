// `pnpm db:seed`: brings the local database up to date, then loads the fake Staff members
// in db/seed.ts. Local and test databases only.
import { LOCAL_ROLE_PASSWORDS, loadEnvLocal, migrationDatabaseUrl } from '../../config';
import { ensureDatabase, runMigrations } from '../migrate';
import { SEED_PASSWORD, SEED_STAFF, seed } from '../seed';

loadEnvLocal();
if (process.env.NODE_ENV === 'production') {
  throw new Error('db:seed loads fake Staff members and never runs with NODE_ENV=production.');
}
const ownerUrl = migrationDatabaseUrl();
await ensureDatabase(ownerUrl, new URL(ownerUrl).pathname.slice(1));
await runMigrations(ownerUrl, { rolePasswords: LOCAL_ROLE_PASSWORDS });
await seed(ownerUrl);

console.log(`Seeded ${SEED_STAFF.length} Staff members. Password for all: ${SEED_PASSWORD}`);
for (const staff of SEED_STAFF) {
  console.log(`  ${staff.email}  ${staff.deactivated ? 'Deactivated' : staff.role}`);
}
