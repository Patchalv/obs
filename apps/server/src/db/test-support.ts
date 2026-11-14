// Integration-test plumbing. It lives in db/ because it opens raw connections, which
// dependency-cruiser allows nowhere else. Tests only: nothing in the running app imports it.
//
// Migrations run once into a template database. Each Vitest worker clones it
// (CREATE DATABASE … TEMPLATE) and every test seeds its own fixtures with fresh UUIDs.
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from 'better-auth/crypto';
import pg from 'pg';
import { LOCAL_ROLE_PASSWORDS } from '../config';
import { runMigrations } from './migrate';

/** The owner's server URL. Any database name in it is ignored. */
const serverUrl = process.env.TEST_DATABASE_URL ?? 'postgres://ping:ping@localhost:5432/postgres';
/** PgBouncer in transaction mode with default_pool_size=1 (compose: pgbouncer-test). */
const pgbouncerUrl = process.env.TEST_PGBOUNCER_URL ?? 'postgres://localhost:6433';

// One Postgres serves every worktree, so names carry a hash of this checkout's path.
const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const prefix = `ping_test_${createHash('sha256').update(repoRoot).digest('hex').slice(0, 8)}`;
const templateName = `${prefix}_template`;

function urlFor(database: string, user?: { name: string; password: string }, base = serverUrl) {
  const url = new URL(base);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user.name;
    url.password = user.password;
  }
  return url.toString();
}

async function withServerClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: urlFor('postgres') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** globalSetup: drop this checkout's old test databases and build a fresh template. */
export async function buildTemplate(): Promise<void> {
  await withServerClient(async (client) => {
    const old = await client.query<{ datname: string }>(
      'select datname from pg_database where datname like $1',
      [`${prefix}\\_%`],
    );
    for (const { datname } of old.rows) {
      await client.query(`drop database if exists ${client.escapeIdentifier(datname)} with (force)`);
    }
    await client.query(`create database ${client.escapeIdentifier(templateName)}`);
  });
  await runMigrations(urlFor(templateName), { rolePasswords: LOCAL_ROLE_PASSWORDS });
}

/** Clones the template into `name`, retrying while another clone holds the template. */
export async function cloneTemplate(name: string): Promise<void> {
  await withServerClient(async (client) => {
    for (let attempt = 0; ; attempt++) {
      try {
        await client.query(
          `create database ${client.escapeIdentifier(name)} template ${client.escapeIdentifier(templateName)}`,
        );
        return;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === '42P04') return; // already exists
        if (code !== '55006' || attempt >= 50) throw error; // 55006: template in use
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  });
}

export async function dropDatabase(name: string): Promise<void> {
  await withServerClient((client) =>
    client.query(`drop database if exists ${client.escapeIdentifier(name)} with (force)`),
  );
}

/** A fresh, uniquely named clone, for tests that change the schema. Drop it afterwards. */
export async function createScratchDatabase(): Promise<string> {
  const name = `${prefix}_scratch_${randomUUID().slice(0, 8)}`;
  await cloneTemplate(name);
  return name;
}

/** This worker's database. */
export function workerDatabaseName(): string {
  return `${prefix}_w${process.env.VITEST_POOL_ID ?? '1'}`;
}

export type TestUrls = { owner: string; app: string; system: string; appViaPgBouncer: string };

export function testUrls(database = workerDatabaseName()): TestUrls {
  const app = { name: 'ping_app', password: LOCAL_ROLE_PASSWORDS.pingApp };
  return {
    owner: urlFor(database),
    app: urlFor(database, app),
    system: urlFor(database, { name: 'ping_system', password: LOCAL_ROLE_PASSWORDS.pingSystem }),
    appViaPgBouncer: urlFor(database, app, pgbouncerUrl),
  };
}

export type Query = <R extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<pg.QueryResult<R>>;

/** Runs `fn` with a raw connection to `url`, closing it afterwards. */
export async function withConnection<T>(url: string, fn: (query: Query) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn((text, values) => client.query(text, values));
  } finally {
    await client.end();
  }
}

export function asOwner<T>(fn: (query: Query) => Promise<T>, database?: string): Promise<T> {
  return withConnection(testUrls(database).owner, fn);
}

/**
 * The RLS-suite harness: connects as ping_app with no server code involved, sets
 * app.staff_id (unless `staffId` is null) and runs `fn` in one transaction, which is
 * rolled back. A statement that fails rolls the whole case back too.
 */
export async function asPingApp<T>(
  staffId: string | null,
  fn: (query: Query) => Promise<T>,
): Promise<T> {
  return withConnection(testUrls().app, async (query) => {
    await query('begin');
    try {
      if (staffId !== null) {
        await query(`select set_config('app.staff_id', $1, true)`, [staffId]);
      }
      return await fn(query);
    } finally {
      await query('rollback');
    }
  });
}

export type StaffFixture = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'member';
};

/** The password every test Staff member gets. Twelve characters or more, as Better Auth requires. */
export const TEST_PASSWORD = 'test-password-for-ping';
let testPasswordHash: Promise<string> | undefined;

/**
 * Inserts a Better Auth user with an email-and-password account and its staff_member row,
 * as the owner. `deactivated` marks them Deactivated by a fresh Admin.
 */
export async function createStaffMember(
  options: {
    role?: 'admin' | 'member';
    name?: string;
    invited?: boolean;
    deactivated?: boolean;
  } = {},
): Promise<StaffFixture> {
  const id = randomUUID();
  const fixture: StaffFixture = {
    id,
    name: options.name ?? `Test Staff ${id.slice(0, 8)}`,
    email: `staff-${id}@example.test`,
    password: TEST_PASSWORD,
    role: options.role ?? 'member',
  };
  testPasswordHash ??= hashPassword(TEST_PASSWORD);
  const passwordHash = await testPasswordHash;
  const deactivatedBy = options.deactivated ? (await createStaffMember({ role: 'admin' })).id : null;

  await asOwner(async (query) => {
    await query('begin');
    await query('insert into "user" (id, name, email, email_verified) values ($1, $2, $3, true)', [
      id,
      fixture.name,
      fixture.email,
    ]);
    await query(
      `insert into account (account_id, provider_id, user_id, password) values ($1, 'credential', $2, $3)`,
      [id, id, passwordHash],
    );
    await query(
      `insert into staff_member (id, role, joined_at, deactivated_at, deactivated_by)
       values ($1, $2, $3, $4, $5)`,
      [
        id,
        fixture.role,
        options.invited ? null : new Date(),
        deactivatedBy ? new Date() : null,
        deactivatedBy,
      ],
    );
    await query('commit');
  });
  return fixture;
}

/** Row counts for every table in the public schema, read as the owner. */
export async function tableRowCounts(): Promise<Record<string, number>> {
  return asOwner(async (query) => {
    const tables = await query<{ name: string }>(
      `select tablename as name from pg_tables where schemaname = 'public' order by tablename`,
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const result = await query<{ n: string }>(
        `select count(*)::text as n from public.${pg.escapeIdentifier(name)}`,
      );
      counts[name] = Number(result.rows[0]?.n);
    }
    return counts;
  });
}
