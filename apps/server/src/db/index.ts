// The ping_app connection. Nothing outside db/ opens a database connection
// (dependency-cruiser enforces it). Ping's own tables are reached only through
// withStaffTx(), so every query runs as one identified Staff member, or through
// withAnonymousTx(), where every policy fails closed.
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export { schema };

type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export type Database = {
  /**
   * Runs `fn` in one transaction that begins with
   * `set_config('app.staff_id', <staffId>, true)`. The setting is local to the
   * transaction, so it never leaks to another request on a pooled connection.
   * Await every query inside `fn`: an unawaited query can escape the transaction.
   */
  withStaffTx<T>(staffId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** A transaction with no Staff member set, for work before sign-in (failed sign-in audit). */
  withAnonymousTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Better Auth's handle, for its own four tables only (which have no row-level
   * security). Ping's tables deny it, because it never sets app.staff_id.
   */
  authDb: Db;
  close(): Promise<void>;
};

export function createDatabase(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });

  return {
    withStaffTx(staffId, fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.staff_id', ${staffId}, true)`);
        return fn(tx);
      });
    },
    withAnonymousTx(fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.staff_id', '', true)`);
        return fn(tx);
      });
    },
    authDb: db,
    close: () => pool.end(),
  };
}
