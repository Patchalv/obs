// Playwright's database: recreates `ping_e2e` from nothing, migrates it and loads the
// seed Staff members. Run by playwright.config.ts before it starts the built app.
import pg from 'pg';
import { LOCAL_ROLE_PASSWORDS, loadEnvLocal, migrationDatabaseUrl } from '../../config';
import { runMigrations } from '../migrate';
import { seed } from '../seed';

loadEnvLocal();
const name = 'ping_e2e';
const serverUrl = new URL(migrationDatabaseUrl());
serverUrl.pathname = '/postgres';

const client = new pg.Client({ connectionString: serverUrl.toString() });
await client.connect();
await client.query(`drop database if exists ${name} with (force)`);
await client.query(`create database ${name}`);
await client.end();

const ownerUrl = new URL(serverUrl);
ownerUrl.pathname = `/${name}`;
await runMigrations(ownerUrl.toString(), { rolePasswords: LOCAL_ROLE_PASSWORDS });
await seed(ownerUrl.toString());
console.log(`Prepared ${name}.`);
