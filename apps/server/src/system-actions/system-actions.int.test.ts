import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { asOwner, testUrls } from '../db/test-support';
import { createSystemActions } from './index';

describe('system actions', () => {
  it('connect as ping_system', async () => {
    const actions = createSystemActions(testUrls().system);
    try {
      const result = await actions.db.execute<{ role: string }>(sql`select current_user as role`);
      expect(result.rows[0]?.role).toBe('ping_system');
    } finally {
      await actions.close();
    }
  });

  it('can run the audit_event retention sweep', async () => {
    await asOwner((query) =>
      query(
        `insert into audit_event (kind, created_at) values ('sign_in_failed', now() - interval '2 years')`,
      ),
    );
    const actions = createSystemActions(testUrls().system);
    try {
      const deleted = await actions.db.execute(
        sql`delete from audit_event where created_at < now() - interval '1 year'`,
      );
      expect(deleted.rowCount).toBeGreaterThan(0);
    } finally {
      await actions.close();
    }
  });
});
