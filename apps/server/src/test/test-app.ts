// The real Hono app, in-process, against this worker's database. Used by the auth tests,
// the permission matrix and the route-coverage guard.
import { randomUUID } from 'node:crypto';
import { createApp } from '../app';
import { type Auth, createAuth } from '../auth';
import { createDatabase, type Database } from '../db';
import { testUrls } from '../db/test-support';

const TEST_ORIGIN = 'http://localhost:5173';

export type TestApp = {
  app: ReturnType<typeof createApp>;
  auth: Auth;
  database: Database;
  close(): Promise<void>;
};

export function createTestApp(): TestApp {
  const database = createDatabase(testUrls().app);
  const auth = createAuth(database, {
    secret: 'test-secret-for-integration-tests-only',
    baseUrl: TEST_ORIGIN,
    trustedOrigins: [TEST_ORIGIN],
  });
  return { app: createApp({ auth }), auth, database, close: () => database.close() };
}

/** A fresh client IP per call, so Better Auth's rate limiter treats each test apart. */
function randomIp(): string {
  const bytes = randomUUID().replaceAll('-', '');
  return `10.${[0, 2, 4].map((i) => Number.parseInt(bytes.slice(i, i + 2), 16)).join('.')}`;
}

/** Headers a browser on the app's origin sends with a JSON request. */
export function jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    origin: TEST_ORIGIN,
    'fly-client-ip': randomIp(),
    ...extra,
  };
}

/** Signs in through the real Better Auth route and returns the Cookie header to send. */
export async function signIn(
  testApp: TestApp,
  credentials: { email: string; password: string },
): Promise<string> {
  const res = await testApp.app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(credentials),
  });
  if (res.status !== 200) {
    throw new Error(`sign-in failed with ${res.status}: ${await res.text()}`);
  }
  return cookieHeader(res);
}

/** Turns a response's Set-Cookie headers into a Cookie request header. */
function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}
