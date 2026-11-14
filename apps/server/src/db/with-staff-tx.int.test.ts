import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database, schema } from './index';
import { createStaffMember, testUrls } from './test-support';

const currentStaffId = sql<string | null>`select public.current_staff_id() as id`;

describe('withStaffTx', () => {
  let db: Database;
  beforeAll(() => {
    db = createDatabase(testUrls().app);
  });
  afterAll(async () => {
    await db.close();
  });

  it('runs as ping_app with app.staff_id set for the transaction', async () => {
    const member = await createStaffMember();
    const result = await db.withStaffTx(member.id, async (tx) => {
      const who = await tx.execute<{ id: string; role: string }>(
        sql`select public.current_staff_id() as id, current_user as role`,
      );
      return who.rows[0];
    });
    expect(result).toEqual({ id: member.id, role: 'ping_app' });
  });

  it('sees Ping’s tables through the policies', async () => {
    const member = await createStaffMember();
    const rows = await db.withStaffTx(member.id, (tx) => tx.select().from(schema.staffMember));
    expect(rows.map((r) => r.id)).toContain(member.id);
  });

  it('rolls back when the function throws', async () => {
    const admin = await createStaffMember({ role: 'admin' });
    const member = await createStaffMember();
    await expect(
      db.withStaffTx(admin.id, async (tx) => {
        await tx.execute(sql`update staff_member set role = 'admin' where id = ${member.id}`);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const roles = await db.withStaffTx(admin.id, (tx) =>
      tx.execute<{ role: string }>(sql`select role from staff_member where id = ${member.id}`),
    );
    expect(roles.rows[0]?.role).toBe('member');
  });

  it('leaves no app.staff_id behind on the connection', async () => {
    const member = await createStaffMember();
    await db.withStaffTx(member.id, async () => {});
    // Outside any wrapper, the same pool's connection reads nothing.
    const leaked = await db.authDb.execute<{ id: string | null }>(currentStaffId);
    expect(leaked.rows[0]?.id).toBeNull();
    expect(await db.authDb.select().from(schema.staffMember)).toEqual([]);
  });
});

describe('withAnonymousTx', () => {
  it('runs with no Staff member, so Ping’s tables read as empty', async () => {
    const db = createDatabase(testUrls().app);
    try {
      await createStaffMember();
      const rows = await db.withAnonymousTx((tx) => tx.select().from(schema.staffMember));
      expect(rows).toEqual([]);
    } finally {
      await db.close();
    }
  });
});
