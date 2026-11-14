import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asOwner, createStaffMember, TEST_PASSWORD } from '../db/test-support';
import { createTestApp, jsonHeaders, signIn, type TestApp } from '../test/test-app';

let testApp: TestApp;
beforeAll(() => {
  testApp = createTestApp();
});
afterAll(async () => {
  await testApp.close();
});

function postSignIn(body: { email: string; password: string }, ip = '203.0.113.10') {
  return testApp.app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: jsonHeaders({ 'fly-client-ip': ip }),
    body: JSON.stringify(body),
  });
}

type AuditRow = {
  actor_id: string | null;
  kind: string;
  target_staff_id: string | null;
  ip_address: string | null;
};

async function auditFor(ip: string): Promise<AuditRow[]> {
  return asOwner(async (query) => {
    const result = await query<AuditRow>(
      `select actor_id, kind, target_staff_id, ip_address from audit_event where ip_address = $1`,
      [ip],
    );
    return result.rows;
  });
}

async function auditRowsAsText(ip: string): Promise<string> {
  return asOwner(async (query) => {
    const result = await query<{ row: string }>(
      'select a::text as row from audit_event a where ip_address = $1',
      [ip],
    );
    return result.rows.map((r) => r.row).join('\n');
  });
}

// A distinct, valid IP per test, so audit rows and rate limits stay apart.
const uniqueIp = () => {
  const n = Number.parseInt(randomUUID().slice(0, 6), 16);
  return `100.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
};

describe('signing in', () => {
  it('signs in an active Staff member with a Secure, SameSite=Lax session cookie', async () => {
    const member = await createStaffMember({ name: 'Marta Ruiz' });
    const res = await postSignIn({ email: member.email, password: member.password }, uniqueIp());
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    const sessionCookie = cookies.find((c) => c.includes('session_token'));
    expect(sessionCookie).toMatch(/;\s*Secure/i);
    expect(sessionCookie).toMatch(/;\s*SameSite=Lax/i);
    expect(sessionCookie).toMatch(/;\s*HttpOnly/i);
  });

  it('gives the signed-in Staff member their name from get-session', async () => {
    const member = await createStaffMember({ name: 'Jordi Puig' });
    const cookie = await signIn(testApp, member);
    const res = await testApp.app.request('/api/auth/get-session', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; name: string } };
    expect(body.user).toMatchObject({ id: member.id, name: 'Jordi Puig' });
  });

  it('records a successful sign-in with the Staff member and IP, and no email', async () => {
    const member = await createStaffMember();
    const ip = uniqueIp();
    await postSignIn({ email: member.email, password: member.password }, ip);
    expect(await auditFor(ip)).toEqual([
      {
        actor_id: member.id,
        kind: 'sign_in_succeeded',
        target_staff_id: member.id,
        ip_address: ip,
      },
    ]);
    expect(await auditRowsAsText(ip)).not.toContain(member.email);
  });

  it('refuses a wrong password and records the failure against the matched Staff member', async () => {
    const member = await createStaffMember();
    const ip = uniqueIp();
    const res = await postSignIn({ email: member.email, password: 'not-the-right-password' }, ip);
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(false);
    expect(await auditFor(ip)).toEqual([
      { actor_id: null, kind: 'sign_in_failed', target_staff_id: member.id, ip_address: ip },
    ]);
    expect(await auditRowsAsText(ip)).not.toContain(member.email);
  });

  it('records a failed sign-in for an unknown email with no Staff member and no email', async () => {
    const ip = uniqueIp();
    const email = `nobody-${randomUUID()}@example.test`;
    const res = await postSignIn({ email, password: TEST_PASSWORD }, ip);
    expect(res.status).toBe(401);
    expect(await auditFor(ip)).toEqual([
      { actor_id: null, kind: 'sign_in_failed', target_staff_id: null, ip_address: ip },
    ]);
    expect(await auditRowsAsText(ip)).not.toContain(email);
  });

  it('refuses a Deactivated Staff member with the right password, and creates no session', async () => {
    const deactivated = await createStaffMember({ deactivated: true });
    const ip = uniqueIp();
    const res = await postSignIn({ email: deactivated.email, password: deactivated.password }, ip);
    expect(res.status).toBe(403);
    expect(res.headers.getSetCookie().some((c) => c.includes('session_token='))).toBe(false);
    const sessions = await asOwner((query) =>
      query('select id from session where user_id = $1', [deactivated.id]),
    );
    expect(sessions.rowCount).toBe(0);
    expect(await auditFor(ip)).toEqual([
      { actor_id: null, kind: 'sign_in_failed', target_staff_id: deactivated.id, ip_address: ip },
    ]);
  });

  it('refuses a user with no staff_member row', async () => {
    const member = await createStaffMember();
    await asOwner((query) => query('delete from staff_member where id = $1', [member.id]));
    const res = await postSignIn({ email: member.email, password: member.password }, uniqueIp());
    expect(res.status).toBe(403);
  });

  it('rate-limits repeated sign-ins from one IP', async () => {
    const member = await createStaffMember();
    const ip = uniqueIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (await postSignIn({ email: member.email, password: 'wrong-password-1' }, ip)).status,
      );
    }
    expect(statuses).toContain(429);
  });
});

describe('signing out', () => {
  it('ends the session', async () => {
    const member = await createStaffMember();
    const cookie = await signIn(testApp, member);
    const out = await testApp.app.request('/api/auth/sign-out', {
      method: 'POST',
      headers: jsonHeaders({ cookie }),
    });
    expect(out.status).toBe(200);
    const res = await testApp.app.request('/api/auth/get-session', { headers: { cookie } });
    expect(await res.json()).toBeNull();
  });
});

describe('public sign-up', () => {
  it('is disabled', async () => {
    const email = `signup-${randomUUID()}@example.test`;
    const res = await testApp.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ email, password: 'a-long-enough-password', name: 'Someone' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const users = await asOwner((query) =>
      query('select id from "user" where email = $1', [email]),
    );
    expect(users.rowCount).toBe(0);
  });
});
