// RLS suite: staff_member, as ping_app with raw SQL and no server code.
// Read: every signed-in Staff member. Insert and update: an Admin, never their own row.
// Delete: an Admin, for an Invited person only.
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { asOwner, asPingApp, createStaffMember, type Query } from '../../db/test-support';

async function newUserId(): Promise<string> {
  const id = randomUUID();
  await asOwner((query) =>
    query(`insert into "user" (id, name, email) values ($1, 'New Person', $2)`, [
      id,
      `new-${id}@example.test`,
    ]),
  );
  return id;
}

const roleOf = async (query: Query, id: string) =>
  (await query<{ role: string }>('select role from staff_member where id = $1', [id])).rows[0]
    ?.role;

describe('staff_member SELECT', () => {
  it('lets any signed-in Staff member read every row', async () => {
    const member = await createStaffMember();
    const other = await createStaffMember({ role: 'admin' });
    await asPingApp(member.id, async (query) => {
      const rows = await query('select id from staff_member where id = any($1)', [
        [member.id, other.id],
      ]);
      expect(rows.rowCount).toBe(2);
    });
  });

  it('returns nothing to a Deactivated Staff member', async () => {
    const deactivated = await createStaffMember({ deactivated: true });
    await asPingApp(deactivated.id, async (query) => {
      expect((await query('select id from staff_member')).rowCount).toBe(0);
    });
  });

  it('returns nothing to an app.staff_id that is no Staff member', async () => {
    await createStaffMember();
    await asPingApp(randomUUID(), async (query) => {
      expect((await query('select id from staff_member')).rowCount).toBe(0);
    });
  });

  it('returns nothing when app.staff_id is unset', async () => {
    await createStaffMember();
    await asPingApp(null, async (query) => {
      expect((await query('select id from staff_member')).rowCount).toBe(0);
    });
  });

  it('returns nothing when app.staff_id was set to empty', async () => {
    await createStaffMember();
    await asPingApp(null, async (query) => {
      await query(`select set_config('app.staff_id', '', true)`);
      expect((await query('select id from staff_member')).rowCount).toBe(0);
    });
  });
});

describe('staff_member INSERT', () => {
  it('lets an Admin insert', async () => {
    const admin = await createStaffMember({ role: 'admin' });
    const id = await newUserId();
    await asPingApp(admin.id, async (query) => {
      await query(`insert into staff_member (id, role, invited_by) values ($1, 'member', $2)`, [
        id,
        admin.id,
      ]);
      expect(await roleOf(query, id)).toBe('member');
    });
  });

  it('refuses a Member', async () => {
    const member = await createStaffMember();
    const id = await newUserId();
    await asPingApp(member.id, async (query) => {
      await expect(
        query(`insert into staff_member (id, role) values ($1, 'admin')`, [id]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('refuses a Deactivated Admin', async () => {
    const admin = await createStaffMember({ role: 'admin', deactivated: true });
    const id = await newUserId();
    await asPingApp(admin.id, async (query) => {
      await expect(
        query(`insert into staff_member (id, role) values ($1, 'member')`, [id]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('refuses when app.staff_id is unset', async () => {
    const id = await newUserId();
    await asPingApp(null, async (query) => {
      await expect(
        query(`insert into staff_member (id, role) values ($1, 'member')`, [id]),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe('staff_member UPDATE', () => {
  it("lets an Admin change someone else's role", async () => {
    const admin = await createStaffMember({ role: 'admin' });
    const member = await createStaffMember();
    await asPingApp(admin.id, async (query) => {
      const result = await query(`update staff_member set role = 'admin' where id = $1`, [
        member.id,
      ]);
      expect(result.rowCount).toBe(1);
      expect(await roleOf(query, member.id)).toBe('admin');
    });
  });

  it('stops a Member changing their own role', async () => {
    const member = await createStaffMember();
    await asPingApp(member.id, async (query) => {
      const result = await query(`update staff_member set role = 'admin' where id = $1`, [
        member.id,
      ]);
      expect(result.rowCount).toBe(0);
      expect(await roleOf(query, member.id)).toBe('member');
    });
  });

  it('stops an Admin writing their own row', async () => {
    const admin = await createStaffMember({ role: 'admin' });
    await asPingApp(admin.id, async (query) => {
      const result = await query(`update staff_member set role = 'member' where id = $1`, [
        admin.id,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });

  it("stops a Member changing someone else's row", async () => {
    const member = await createStaffMember();
    const other = await createStaffMember();
    await asPingApp(member.id, async (query) => {
      const result = await query(`update staff_member set role = 'admin' where id = $1`, [
        other.id,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });

  it('changes nothing when app.staff_id is unset', async () => {
    const member = await createStaffMember();
    await asPingApp(null, async (query) => {
      const result = await query(`update staff_member set role = 'admin' where id = $1`, [
        member.id,
      ]);
      expect(result.rowCount).toBe(0);
    });
  });
});

describe('staff_member DELETE', () => {
  it('lets an Admin delete an Invited person', async () => {
    const admin = await createStaffMember({ role: 'admin' });
    const invited = await createStaffMember({ invited: true });
    await asPingApp(admin.id, async (query) => {
      const result = await query('delete from staff_member where id = $1', [invited.id]);
      expect(result.rowCount).toBe(1);
    });
  });

  it('stops an Admin deleting someone who has joined', async () => {
    const admin = await createStaffMember({ role: 'admin' });
    const member = await createStaffMember();
    await asPingApp(admin.id, async (query) => {
      const result = await query('delete from staff_member where id = $1', [member.id]);
      expect(result.rowCount).toBe(0);
    });
  });

  it('stops a Member deleting an Invited person', async () => {
    const member = await createStaffMember();
    const invited = await createStaffMember({ invited: true });
    await asPingApp(member.id, async (query) => {
      const result = await query('delete from staff_member where id = $1', [invited.id]);
      expect(result.rowCount).toBe(0);
    });
  });

  it('deletes nothing when app.staff_id is unset', async () => {
    const invited = await createStaffMember({ invited: true });
    await asPingApp(null, async (query) => {
      const result = await query('delete from staff_member where id = $1', [invited.id]);
      expect(result.rowCount).toBe(0);
    });
  });
});
