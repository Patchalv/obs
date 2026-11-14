// Applies migrations as the owner role. Used by `pnpm db:migrate`, the integration-test
// template and the Playwright server.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const migrationsFolder = fileURLToPath(new URL('./migrations', import.meta.url));

type RolePasswords = { pingApp: string; pingSystem: string };

export async function runMigrations(
  ownerUrl: string,
  options: { rolePasswords?: RolePasswords } = {},
): Promise<void> {
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder });
    if (options.rolePasswords) {
      await setRolePasswords(client, options.rolePasswords);
    }
  } finally {
    await client.end();
  }
}

/** Local and test only. Hosted environments set role passwords out of band. */
async function setRolePasswords(client: pg.Client, passwords: RolePasswords): Promise<void> {
  const quote = async (value: string) =>
    (await client.query<{ q: string }>('select quote_literal($1) as q', [value])).rows[0]?.q;
  await client.query(`alter role ping_app password ${await quote(passwords.pingApp)}`);
  await client.query(`alter role ping_system password ${await quote(passwords.pingSystem)}`);
}

/** Creates `name` if it doesn't exist, connecting through the owner URL's server. */
export async function ensureDatabase(ownerUrl: string, name: string): Promise<void> {
  const url = new URL(ownerUrl);
  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const exists = await client.query('select 1 from pg_database where datname = $1', [name]);
    if (exists.rowCount === 0) {
      await client.query(`create database ${client.escapeIdentifier(name)}`);
    }
  } finally {
    await client.end();
  }
}
