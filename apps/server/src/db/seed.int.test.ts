import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, jsonHeaders, type TestApp } from '../test/test-app';
import { SEED_PASSWORD, SEED_STAFF, seed } from './seed';
import { asOwner, testUrls } from './test-support';

describe('db:seed', () => {
  let testApp: TestApp;
  beforeAll(async () => {
    await seed(testUrls().owner);
    testApp = createTestApp();
  });
  afterAll(async () => {
    await testApp.close();
  });

  const signIn = (email: string) =>
    testApp.app.request('/api/auth/sign-in/email', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    });

  it('loads at least one Admin, several Members and one Deactivated Staff member', async () => {
    const rows = await asOwner((query) =>
      query<{ role: string; deactivated: boolean }>(
        `select role, deactivated_at is not null as deactivated from staff_member where id = any($1)`,
        [SEED_STAFF.map((s) => s.id)],
      ),
    );
    expect(rows.rows.filter((r) => r.role === 'admin' && !r.deactivated).length).toBeGreaterThan(0);
    expect(rows.rows.filter((r) => r.role === 'member' && !r.deactivated).length).toBeGreaterThan(
      1,
    );
    expect(rows.rows.filter((r) => r.deactivated)).toHaveLength(1);
  });

  it('is safe to run twice', async () => {
    await seed(testUrls().owner);
    const users = await asOwner((query) =>
      query('select id from "user" where id = any($1)', [SEED_STAFF.map((s) => s.id)]),
    );
    expect(users.rowCount).toBe(SEED_STAFF.length);
  });

  it('lets each active seeded Staff member sign in with the documented password', async () => {
    for (const staff of SEED_STAFF.filter((s) => !s.deactivated)) {
      expect((await signIn(staff.email)).status, staff.email).toBe(200);
    }
  });

  it('refuses the seeded Deactivated Staff member', async () => {
    const deactivated = SEED_STAFF.find((s) => s.deactivated);
    expect((await signIn(deactivated?.email ?? '')).status).toBe(403);
  });
});
