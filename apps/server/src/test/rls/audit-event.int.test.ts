// RLS suite: audit_event is insert-only for ping_app. Nothing reads it through the app.
import { describe, expect, it } from 'vitest';
import { asOwner, asPingApp, createStaffMember } from '../../db/test-support';

describe('audit_event as ping_app', () => {
  it('lets a Staff member insert an event as themself', async () => {
    const member = await createStaffMember();
    await asPingApp(member.id, async (query) => {
      const result = await query(
        `insert into audit_event (actor_id, kind) values ($1, 'sign_in_succeeded')`,
        [member.id],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  it('allows an anonymous event (a failed sign-in) with no Staff member set', async () => {
    await asPingApp(null, async (query) => {
      const result = await query(`insert into audit_event (kind) values ('sign_in_failed')`);
      expect(result.rowCount).toBe(1);
    });
  });

  it('refuses an event recorded in someone else’s name', async () => {
    const member = await createStaffMember();
    const other = await createStaffMember();
    await asPingApp(member.id, async (query) => {
      await expect(
        query(`insert into audit_event (actor_id, kind) values ($1, 'sign_in_succeeded')`, [
          other.id,
        ]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('refuses a named event when app.staff_id is unset', async () => {
    const member = await createStaffMember();
    await asPingApp(null, async (query) => {
      await expect(
        query(`insert into audit_event (actor_id, kind) values ($1, 'sign_in_succeeded')`, [
          member.id,
        ]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('can’t read, update or delete events', async () => {
    const admin = await createStaffMember({ role: 'admin' });
    await asOwner((query) =>
      query(`insert into audit_event (actor_id, kind) values ($1, 'sign_in_succeeded')`, [
        admin.id,
      ]),
    );
    for (const statement of [
      'select id from audit_event',
      `update audit_event set kind = 'x'`,
      'delete from audit_event',
    ]) {
      await asPingApp(admin.id, async (query) => {
        await expect(query(statement)).rejects.toThrow(/permission denied/);
      });
    }
  });
});
