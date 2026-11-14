// The pooler test: through PgBouncer in transaction mode with default_pool_size=1, every
// request shares one backend. Request B must never see request A's app.staff_id.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './index';
import { createStaffMember, testUrls } from './test-support';

const whoAmI = sql`select public.current_staff_id() as staff_id, pg_backend_pid() as pid`;
type WhoAmI = { staff_id: string | null; pid: number };

describe('withStaffTx through PgBouncer (transaction mode, pool size 1)', () => {
  let db: Database;
  beforeAll(() => {
    db = createDatabase(testUrls().appViaPgBouncer);
  });
  afterAll(async () => {
    await db.close();
  });

  it("never shows request B request A's app.staff_id", async () => {
    const a = await createStaffMember();
    const b = await createStaffMember();

    const requestA = await db.withStaffTx(a.id, async (tx) => (await tx.execute<WhoAmI>(whoAmI)).rows[0]);
    const between = (await db.authDb.execute<WhoAmI>(whoAmI)).rows[0];
    const requestB = await db.withStaffTx(b.id, async (tx) => (await tx.execute<WhoAmI>(whoAmI)).rows[0]);
    const anonymous = await db.withAnonymousTx(async (tx) => (await tx.execute<WhoAmI>(whoAmI)).rows[0]);

    // One backend served all of them, so the test can't pass by luck of routing.
    expect(new Set([requestA?.pid, between?.pid, requestB?.pid, anonymous?.pid]).size).toBe(1);
    expect(requestA?.staff_id).toBe(a.id);
    expect(between?.staff_id).toBeNull();
    expect(requestB?.staff_id).toBe(b.id);
    expect(anonymous?.staff_id).toBeNull();
  });

  it('keeps concurrent requests apart on the shared backend', async () => {
    const staff = await Promise.all([1, 2, 3, 4, 5].map(() => createStaffMember()));
    const seen = await Promise.all(
      staff.map((s) =>
        db.withStaffTx(s.id, async (tx) => {
          const first = (await tx.execute<WhoAmI>(whoAmI)).rows[0];
          await tx.execute(sql`select pg_sleep(0.02)`);
          const second = (await tx.execute<WhoAmI>(whoAmI)).rows[0];
          return { expected: s.id, first, second };
        }),
      ),
    );
    for (const { expected, first, second } of seen) {
      expect(first?.staff_id).toBe(expected);
      expect(second?.staff_id).toBe(expected);
    }
    expect(new Set(seen.map((s) => s.first?.pid)).size).toBe(1);
  });
});
