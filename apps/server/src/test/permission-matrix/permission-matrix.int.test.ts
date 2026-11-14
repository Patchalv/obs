import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { schema, type Tx } from '../../db';
import { asOwner, createStaffMember } from '../../db/test-support';
import { createTestApp, type TestApp } from '../test-app';
import { createActor, STANDARD_ACTORS } from './actors';
import { MATRIX, type MatrixRow } from './matrix';
import { runRow } from './run-row';

describe.runIf(MATRIX.length > 0)('permission matrix', () => {
  let testApp: TestApp;
  beforeAll(() => {
    testApp = createTestApp();
  });
  afterAll(async () => {
    await testApp.close();
  });

  it.each(
    MATRIX.map(
      (row) => [`${row.route} · ${row.actor} · ${row.channel} · ${row.action}`, row] as const,
    ),
  )('%s', async (_name, row) => {
    await runRow(testApp, row);
  });
});

// The harness tested on a route that exists only here: promote a Staff member to Admin.
describe('permission matrix harness', () => {
  let testApp: TestApp;
  beforeAll(() => {
    testApp = createTestApp();
    // `leaky` writes before it denies, so a deny row against it must fail.
    for (const leaky of [false, true]) {
      testApp.app.post(`/api/test-only/${leaky ? 'leaky' : 'safe'}/:staffId/promote`, async (c) => {
        const session = await testApp.auth.api.getSession({ headers: c.req.raw.headers });
        if (!session) return c.json({ error: 'unauthenticated' }, 401);
        const promote = (tx: Tx) =>
          tx
            .update(schema.staffMember)
            .set({ role: 'admin' })
            .where(eq(schema.staffMember.id, c.req.param('staffId')));
        if (leaky) {
          await asOwner((query) =>
            query(`update staff_member set role = 'admin' where id = $1`, [c.req.param('staffId')]),
          );
        }
        const isAdmin = await testApp.database.withStaffTx(session.user.id, async (tx) => {
          const me = await tx
            .select({ role: schema.staffMember.role })
            .from(schema.staffMember)
            .where(eq(schema.staffMember.id, session.user.id));
          return me[0]?.role === 'admin';
        });
        if (!isAdmin) return c.json({ error: 'forbidden' }, 403);
        await testApp.database.withStaffTx(session.user.id, promote);
        return c.json({ ok: true });
      });
    }
  });
  afterAll(async () => {
    await testApp.close();
  });

  /** A row against the test-only route, promoting a fresh Member. */
  async function promoteRow(
    actor: MatrixRow['actor'],
    expected: MatrixRow['expect'],
    variant: 'safe' | 'leaky' = 'safe',
  ): Promise<{ row: MatrixRow; targetId: string }> {
    const target = await createStaffMember();
    const row: MatrixRow = {
      route: `POST /api/test-only/${variant}/:staffId/promote`,
      action: 'promote a Member to Admin',
      actor,
      channel: null,
      request: () => ({ path: `/api/test-only/${variant}/${target.id}/promote`, method: 'POST' }),
      expect: expected,
    };
    return { row, targetId: target.id };
  }

  it('creates every standard actor with a working session, except the Deactivated one', async () => {
    for (const kind of STANDARD_ACTORS) {
      const actor = await createActor(testApp, kind);
      const res = await testApp.app.request('/api/auth/get-session', {
        headers: { cookie: actor.cookie },
      });
      const body = (await res.json()) as { user: { id: string } } | null;
      if (kind === 'deactivated') expect(body).toBeNull();
      else expect(body?.user.id).toBe(actor.staff.id);
    }
  });

  it('passes an allow row', async () => {
    const { row, targetId } = await promoteRow('adminNonMember', { allow: true, status: 200 });
    await runRow(testApp, row);
    const role = await asOwner((query) =>
      query<{ role: string }>('select role from staff_member where id = $1', [targetId]),
    );
    expect(role.rows[0]?.role).toBe('admin');
  });

  it.each([
    ['nonMemberMember', 403],
    ['deactivated', 401],
  ] as const)('passes a deny row for %s', async (actor, status) => {
    const { row } = await promoteRow(actor, { allow: false, status });
    await runRow(testApp, row);
  });

  it('fails a deny row whose route changed the database', async () => {
    const { row } = await promoteRow('nonMemberMember', { allow: false, status: 403 }, 'leaky');
    await expect(runRow(testApp, row)).rejects.toThrow(/changed the database/);
  });

  it('fails a row whose status is wrong', async () => {
    const { row } = await promoteRow('nonMemberMember', { allow: false, status: 404 });
    await expect(runRow(testApp, row)).rejects.toThrow(/promote a Member to Admin/);
  });
});
