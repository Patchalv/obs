// Every environment variable the server reads. Each has a working local default for the
// Docker stack; production (NODE_ENV=production) must set the ones marked required.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RolePasswords } from './db/migrate';

const envLocal = fileURLToPath(new URL('../../../.env.local', import.meta.url));

/** Loads the repo's gitignored .env.local, if there is one. Shell variables win. */
export function loadEnvLocal(): void {
  if (existsSync(envLocal)) {
    process.loadEnvFile(envLocal);
  }
}

export type ServerConfig = {
  /** ping_app, through the pooler. */
  databaseUrl: string;
  /** ping_system, through the pooler. */
  systemDatabaseUrl: string;
  auth: {
    secret: string;
    baseUrl: string;
    trustedOrigins: string[];
  };
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const isProduction = env.NODE_ENV === 'production';
  const required = (name: string, localDefault: string): string => {
    const value = env[name];
    if (value) return value;
    if (isProduction) throw new Error(`${name} must be set when NODE_ENV=production`);
    return localDefault;
  };

  // Locally people open Vite on 5173, even though the server itself runs on SERVER_PORT.
  const baseUrl = required('BETTER_AUTH_URL', 'http://localhost:5173');
  const trustedOrigins = env.BETTER_AUTH_TRUSTED_ORIGINS
    ? env.BETTER_AUTH_TRUSTED_ORIGINS.split(',').map((origin) => origin.trim())
    : isProduction
      ? [baseUrl]
      : [baseUrl, 'http://localhost:5173', 'http://localhost:3000'];

  return {
    databaseUrl: required('DATABASE_URL', 'postgres://ping_app:ping_app@localhost:6432/ping'),
    systemDatabaseUrl: required(
      'SYSTEM_DATABASE_URL',
      'postgres://ping_system:ping_system@localhost:6432/ping',
    ),
    auth: {
      secret: required('BETTER_AUTH_SECRET', 'ping-local-dev-secret-not-for-production-use'),
      baseUrl,
      trustedOrigins,
    },
  };
}

/** The owner role, for migrations and the dev seed only. The running app never uses it. */
export function migrationDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.MIGRATION_DATABASE_URL ?? 'postgres://ping:ping@localhost:5432/ping';
}

/** The local role passwords `pnpm db:migrate` sets. Hosted environments set their own. */
export const LOCAL_ROLE_PASSWORDS: RolePasswords = {
  pingApp: 'ping_app',
  pingSystem: 'ping_system',
};
