import { expect, test } from '@playwright/test';

// Seeded by apps/server/src/db/seed.ts.
const PASSWORD = 'ping-local-dev-password';

// Locally nothing sets Fly-Client-IP, so Better Auth's sign-in rate limiter would put
// every test in one shared bucket. Each test gets its own address, as on Fly.
let nextIp = 1;
test.beforeEach(async ({ page }, testInfo) => {
  const octet = (testInfo.workerIndex * 16 + nextIp++) % 250;
  await page.setExtraHTTPHeaders({ 'fly-client-ip': `192.0.2.${octet + 1}` });
});

test('a Staff member signs in, sees their name, and signs out', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('jordi.puig@example.com');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Signed in as Jordi Puig' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Signed in as Jordi Puig' })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to Ping' })).toBeVisible();
});

test('a wrong password is refused', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('laura.gomez@example.com');
  await page.getByLabel('Password').fill('not-the-right-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('That email and password don’t match.');
});

test('a Deactivated Staff member is refused', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('carlos.vidal@example.com');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'You’ve been Deactivated in Ping. Ask a Ping Admin.',
  );
  await expect(page.getByRole('heading', { name: 'Sign in to Ping' })).toBeVisible();
});
