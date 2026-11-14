// The ping_system connection: a small pool for work with no signed-in Staff member behind
// it (invite acceptance, bootstrap-admin, the sweepers). Only system-actions/ may import
// this file; dependency-cruiser enforces it (ADR 0004).
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type SystemDb = NodePgDatabase<typeof schema>;

export function createSystemPool(connectionString: string): {
  db: SystemDb;
  close(): Promise<void>;
} {
  const pool = new pg.Pool({ connectionString, max: 2 });
  return { db: drizzle(pool, { schema }), close: () => pool.end() };
}
