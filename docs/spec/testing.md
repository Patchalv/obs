# Testing

How agent-written code is tested, including both permission layers. This is the strategy. The **first build slice** turns it into `docs/testing.md`, once real test commands exist, and adds the test commands and a one-line pointer to `docs/testing.md` in `CLAUDE.md`. Every `ready-for-agent` issue in the build plan links `docs/testing.md` from its acceptance criteria.

Source: [How do we test agent-written code, including both permission layers?](https://github.com/Patchalv/ping/issues/16#issuecomment-6863779106) and its [addendum](https://github.com/Patchalv/ping/issues/16#issuecomment-6863848373).

## Layers and tooling

- **Runner:** Vitest across the whole pnpm monorepo.
- **Unit tests** cover pure logic only, with no database:
  - the permissions module's decision functions;
  - the ProseMirror allowlist validator;
  - `body_text` extraction;
  - working out who gets a Ping for a new Thread, Response or Mention.

  Anything that touches SQL is an integration test.
- **Integration database:** a Postgres container, pinned to Neon's Postgres major version. CI uses a service container; local runs use the same image through `docker compose`. There's no Neon branch per CI run.
  - Migrations run once, as the owner, into a template database, with the real `ping_app` and `ping_system` roles and the RLS policies.
  - Each Vitest worker gets its own clone (`CREATE DATABASE … TEMPLATE`).
  - Each test seeds its own fixtures with fresh UUIDs and never cleans up.
  - Tests aren't wrapped in a rollback, because the code under test opens its own transactions with `set_config`.
- **End-to-end:** a small Playwright smoke suite against the built app and the CI database, with MinIO standing in for R2. It covers:
  - signing in;
  - posting a Thread;
  - a second Staff member receiving the Ping over the live-update stream;
  - Acknowledging, which clears it;
  - a Private channel being absent for a non-member and for a company Admin who isn't a member;
  - an Attachment round trip.
- **Front end:** no React component tests in the MVP. Only pure helper functions get unit tests. The front end is never trusted for permissions.

## Server permissions: the permission matrix

- One shared, table-driven suite: **actor × Channel × action → allow or deny**.
- It runs through the real Hono app in-process (`app.request`) against the real database, so routing, the permissions module and SQL are tested together.
- **Standard actors:**
  - author;
  - Channel admin;
  - Channel member;
  - non-member Member;
  - company Admin who isn't a member;
  - company Admin who is a member;
  - Deactivated Staff member.
- **Channels:** Public, Private and Archived.
- **Deny cases assert two things:** the status (404 for a Private channel, so its existence doesn't leak) and that the database is unchanged.
- **Route-coverage guard:** a test lists every registered Hono route and fails if any route has no matrix entry. A short explicit allowlist covers the exceptions: `/healthz`, the Better Auth routes, and invite accept and password reset. There's no percentage coverage gate.

The rules the matrix encodes are in [permissions.md](permissions.md#server-layer-who-can-do-what).

## RLS as its own layer

- **RLS suite.** It connects as `ping_app` with no server code involved, sets `app.staff_id`, and runs raw SELECT, INSERT, UPDATE and DELETE against every table. It proves:
  - the visibility rule (Public, or you're a member, with no Admin exception);
  - owner-only rows for Ping, Saved, mute and Sections;
  - the special policies on `staff_member`, `staff_invite`, `spark_settings`, `pending_file_deletion` and `audit_event`;
  - failing closed when `app.staff_id` is unset.
- **Catalog guard.** It reads `pg_catalog` and fails CI if:
  - `ping_app` or `ping_system` has BYPASSRLS or superuser;
  - either role owns any table;
  - any table in Ping's schema lacks `relrowsecurity` and `relforcerowsecurity`, or has no policy. The only allowlisted tables are Better Auth's: `user`, `session`, `account`, `verification`.

## Pooler behaviour

- **In CI:** a PgBouncer service container in transaction mode with `default_pool_size=1`, which forces every request onto the same backend. A test proves request B never sees request A's `app.staff_id`.
- **After each staging deploy:** a smoke test runs the same check through Neon's real pooler. A failure fails the workflow and blocks promote.

## Rules for agents

- **Every slice ships with:**
  - matrix rows for every new or changed endpoint: at least one allow, plus a deny for every standard actor who shouldn't pass;
  - RLS suite cases for every new table (the catalog guard catches a missing policy anyway);
  - unit tests for new pure logic;
  - Playwright changes only when the slice changes one of the smoke journeys.
- **Tests come first,** red then green, using the `tdd` skill.
- **Agents never weaken the guards.** Unless the issue explicitly says to, an agent must not change an existing matrix or RLS expectation, or edit the catalog-guard allowlist or the route allowlist. Any such change is listed in the PR body under a **Permission changes** heading so Patrick reviews it by hand.
- **CI gate:** every PR to `master` runs every suite: unit, integration and matrix, RLS and catalog, PgBouncer, route coverage and Playwright. Branch protection requires them all to pass before merge.

## What the first build slice owes

The first slice lays the foundations every later slice relies on:

- the monorepo, Vitest, the Postgres container setup with template-database cloning, and the CI workflow;
- the `ping_app` and `ping_system` roles, `FORCE ROW LEVEL SECURITY` in raw SQL, and the per-request transaction wrapper with `set_config('app.staff_id', …, true)`;
- the catalog guard and the route-coverage guard;
- the PgBouncer pooler test in CI;
- the staging environment and deploy pipeline, with the **real-Neon pooler smoke test** gating promote. This is the proof [ADR 0004](../adr/0004-rls-roles-and-staff-member-table.md) says the first slice owes;
- `docs/testing.md` and the `CLAUDE.md` test commands and pointer.
