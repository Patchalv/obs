# Testing

How Ping is tested, with the commands that run each suite. The strategy behind it is in [docs/spec/testing.md](spec/testing.md), and the rules both permission layers follow are in [docs/spec/permissions.md](spec/permissions.md).

## Before you run anything

The integration and Playwright suites need the local stack:

```bash
pnpm db:up
```

That starts Postgres 18, PgBouncer (port 6432), the pooler-test PgBouncer (port 6433, `default_pool_size=1`) and MinIO. Unit tests don't need it.

## Commands

| Command | Runs | Needs the stack |
| --- | --- | --- |
| `pnpm test` | Unit tests: pure logic, plus the route-coverage guard. | No |
| `pnpm test:int` | Integration tests: the RLS suite, the catalog guard, the permission matrix, sign-in, `withStaffTx`, the PgBouncer test and the seed. | Yes |
| `pnpm test:e2e` | Playwright against the built app, at laptop and phone size. | Yes |
| `pnpm test:related <files>` | The unit and integration tests that touch those files. | For integration tests |
| `pnpm check` | Every check CI runs except `pnpm audit` and Playwright. | Yes |
| `pnpm db:seed` | Migrates the local database and loads the fake Staff members. | Yes |

Run one file with `pnpm exec vitest run <path>`.

## The suites

### Unit tests (`*.test.ts`)

Pure logic only, with no database: permission decisions, validators, text extraction, who gets a Ping, and the front end's pure helpers. Anything that touches SQL is an integration test. There are no React component tests.

### Integration tests (`*.int.test.ts`)

They run against the `docker compose` Postgres:

- `globalSetup` (`apps/server/src/test/global-setup.ts`) drops this checkout's old test databases, then runs the migrations once, as the owner, into a template database with the real `ping_app` and `ping_system` roles and policies.
- Each Vitest worker clones the template (`CREATE DATABASE … TEMPLATE`) in `apps/server/src/test/worker-setup.ts`.
- Database names start with a hash of the checkout's path, so worktrees sharing the stack never collide.
- Each test seeds its own fixtures with fresh UUIDs and never cleans up. Nothing is wrapped in a rollback, because the code under test opens its own transactions.

The plumbing is in `apps/server/src/db/test-support.ts`, because only `db/` may open a raw connection. Use `createStaffMember()` for fixtures and `asOwner()` to set up or inspect rows behind row-level security.

### The RLS suite (`apps/server/src/test/rls/`)

It connects as `ping_app` with no server code involved, sets `app.staff_id`, and runs raw SQL:

```ts
await asPingApp(member.id, async (query) => {
  const result = await query(`update staff_member set role = 'admin' where id = $1`, [member.id]);
  expect(result.rowCount).toBe(0);
});
```

Pass `null` instead of an ID to test failing closed. Each case runs in one transaction that is rolled back. Every new table needs cases for SELECT, INSERT, UPDATE and DELETE, plus failing closed. Every system function needs cases proving it acts for `app.staff_id`, does nothing when it's unset, and can't be steered through its arguments.

### The catalog guard (`apps/server/src/test/catalog-guard.int.test.ts`)

It reads `pg_catalog` and fails if:

- `ping_app` or `ping_system` is a superuser, has BYPASSRLS, is a member of another role, or owns a table;
- a table in `public` outside Better Auth's (`user`, `session`, `account`, `verification`) lacks row-level security, `FORCE ROW LEVEL SECURITY` or a policy;
- a `SECURITY DEFINER` function is missing from the allowlist or has no pinned `search_path`.

The allowlists are in `apps/server/src/test/catalog.ts`.

### The permission matrix (`apps/server/src/test/permission-matrix/`)

Table-driven actor × Channel × action rows, run through the real Hono app in-process (`app.request`) against the real database. Add rows to `MATRIX` in `matrix.ts`:

```ts
{
  route: 'POST /api/channels',
  action: 'create a Private channel',
  actor: 'nonMemberMember',
  channel: null,
  request: () => ({ path: '/api/channels', method: 'POST', body: { name: 'Ops', visibility: 'private' } }),
  expect: { allow: true, status: 201 },
}
```

- The standard actors are in `actors.ts`. Each is a real Staff member signed in through Better Auth. The Deactivated actor replays a cookie from before their Deactivation.
- Deny rows assert the status and that the database is unchanged: every table's rows are checksummed before and after.
- Rows with a Channel use Channel fixtures, which the first Channel slice adds to `run-row.ts`.
- Every new or changed endpoint needs at least one allow row, plus a deny row for every standard actor who shouldn't pass.

### The route-coverage guard (`apps/server/src/test/route-coverage.test.ts`)

It lists every registered Hono route and fails if one has neither a matrix row nor an allowlist entry. The allowlist, in `route-coverage.ts`, holds `/healthz` and Better Auth's routes; invite accept and password reset join it in their slices.

### The PgBouncer test (`apps/server/src/db/pgbouncer.int.test.ts`)

It runs `withStaffTx` through PgBouncer in transaction mode with `default_pool_size=1`, proves every request landed on the same backend, and proves request B never sees request A's `app.staff_id`.

### Playwright (`e2e/`)

The smoke suite builds the app, recreates and seeds a `ping_e2e` database, starts the production server on port 3100, and runs each journey at laptop and phone size. Today it covers signing in, a wrong password, a Deactivated Staff member and signing out. Change it only when a slice changes one of the smoke journeys.

Locally nothing sets `Fly-Client-IP`, so Better Auth's sign-in rate limiter would put every test in one bucket. Each test sends its own address.

## Seeded Staff members

`pnpm db:seed` loads fake Spark Staff members. They all use the password `ping-local-dev-password`, which is also in `.env.example` and `apps/server/src/db/seed.ts`.

| Email | Role |
| --- | --- |
| `marta.ruiz@example.com` | Admin |
| `jordi.puig@example.com` | Member |
| `laura.gomez@example.com` | Member |
| `pablo.serra@example.com` | Member |
| `carlos.vidal@example.com` | Deactivated (sign-in is refused) |

## Rules for every slice

- Tests come first, red then green, with the `tdd` skill.
- Ship matrix rows for every new or changed endpoint, RLS cases for every new table, and unit tests for new pure logic.
- Never weaken a guard. Unless the issue says so, don't change an existing matrix or RLS expectation, the catalog-guard allowlists or the route allowlist. List any such change under **Permission changes** in the PR.
- CI runs every suite on every PR, and branch protection requires them to pass.
