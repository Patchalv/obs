# Ping

Ping is Spark's internal staff tool for communication and work tracking: Channels, Threads, Thread Responses, Pings and Saved. `GLOSSARY.md` defines every term, and the code uses them as written there.

So far the repo has the foundations: the database with its two permission roles and row-level security, the test harnesses, and sign-in. A signed-in Staff member sees a placeholder page with their name. There are no product features yet.

## Setup

You need:

- **Node 26.** `.nvmrc` pins it, so `nvm use` picks the right version.
- **pnpm 10.34.9.** `package.json` pins it. Run `corepack enable` once and corepack provides that version whenever you run `pnpm` in this repo. An older pnpm refuses to install here, because pnpm 9 silently drops the overrides in `pnpm-workspace.yaml` from the lockfile.
- **Docker** (Docker Desktop or OrbStack), for the local Postgres, PgBouncer and MinIO.

First time:

```bash
nvm use
```

```bash
corepack enable
```

```bash
pnpm install
```

```bash
pnpm db:up
```

```bash
pnpm db:seed
```

```bash
pnpm dev
```

Open http://localhost:5173 and sign in as a seeded Staff member, for example `jordi.puig@example.com` with the password `ping-local-dev-password`. `docs/testing.md` lists every seeded Staff member.

There are no secrets to set up locally. `.env.example` lists every environment variable the code reads, and each has a working local default.

## Commands

### Running the app

| Command | What it does | Use it when |
| --- | --- | --- |
| `pnpm dev` | Starts Vite on 5173 and the Hono server on 3000 together. Vite serves the React app from source and forwards `/healthz` and `/api` to Hono. React updates in the browser as you save, and the server restarts when its files change. | You're building or trying out a feature. This is the everyday command. |
| `pnpm build` | Builds the React app into `apps/web/dist`. | Before `pnpm start`. |
| `pnpm start` | Starts Hono alone on 3000. It serves the built app, its assets and the API from one process, the way the production container does. Nothing reloads. | You want to check the production shape: the built app loads, a refresh on a deep link like `/channels/123` still loads the app, and `/api/*` never returns the page. |

`pnpm start` without a build serves `/healthz` only. Rebuild after every change you want to see there.

`pnpm start` runs with `NODE_ENV=production`, so it refuses to start without `DATABASE_URL`, `SYSTEM_DATABASE_URL`, `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`. Locally, copy the values from `.env.example` into `.env.local` and set `BETTER_AUTH_URL=http://localhost:3000`. `pnpm test:e2e` sets its own.

### Local services

| Command | What it does |
| --- | --- |
| `pnpm db:up` | Starts Postgres, PgBouncer and MinIO in Docker (`docker compose up -d --wait`) and waits until all three are healthy. |
| `pnpm db:down` | Stops them and removes the containers (`docker compose down`). The data volumes stay, so the next `db:up` starts where you left off. |
| `pnpm db:migrate` | Applies the migrations as the owner role and sets the local passwords of the `ping_app` and `ping_system` roles. |
| `pnpm db:seed` | Runs `db:migrate`, then loads fake Staff members: one Admin, three Members and one Deactivated. They all use the password `ping-local-dev-password`. Safe to run again. |

`pnpm dev`, the integration tests, Playwright and Claude Code's Stop gate all need them running.

Every worktree shares one stack. The Compose project is named `ping` whichever folder you run it from.

| Service | Address | Login |
| --- | --- | --- |
| Postgres 18 | `localhost:5432` | `ping` / `ping`, database `ping` |
| PgBouncer (transaction mode) | `localhost:6432` | same as Postgres, plus `ping_app` / `ping_app` and `ping_system` / `ping_system` |
| PgBouncer for the pooler test (`default_pool_size=1`) | `localhost:6433` | same |
| MinIO S3 API | `localhost:9000` | `ping` / `ping-minio-local` |
| MinIO console | http://localhost:9001 | same as the S3 API |

Postgres is pinned to 18 to match Neon. PgBouncer runs in transaction mode like Neon's pooler, so session state never carries over between transactions. The app connects through it as `ping_app`. MinIO stands in for Cloudflare R2.

To open a Postgres shell through PgBouncer:

```bash
docker compose exec postgres psql "postgres://ping:ping@pgbouncer:6432/ping"
```

### Checks

`pnpm check` runs everything below except `pnpm test:e2e`, in order, and stops at the first failure. It needs `pnpm db:up`. CI runs the same checks plus `pnpm audit` and Playwright on every pull request, and they must pass before a merge. `docs/testing.md` explains each test suite.

| Command | What it catches |
| --- | --- |
| `pnpm typecheck` | Type errors in every package (`tsc -b`, strict settings from `tsconfig.base.json`). |
| `pnpm lint` | Formatting and lint problems (Biome), including `any` and `@ts-ignore`. It also fails on an `@ts-expect-error` with no reason after it. |
| `pnpm lint:fix` | Fixes whatever Biome can fix on its own, mostly formatting and import order. |
| `pnpm lint:types` | Unawaited promises, promises passed where a callback can't handle them, and `switch` statements that miss a case (type-aware ESLint, three rules only). An unawaited query can run outside its transaction, which is why these matter. |
| `pnpm knip` | Unused files, exports and dependencies. |
| `pnpm depcruise` | Imports that cross the boundaries: raw database drivers outside `apps/server/src/db/`, the system pool outside `system-actions/`, runtime server code in `apps/web`, and server code in `packages/shared`. |
| `pnpm check:terms` | Banned words in identifiers, file names and migration SQL, such as `ticket`, `notification` or `todo`. The list and its exceptions are in `check-terms.config.json`. Use the `GLOSSARY.md` term instead. |
| `pnpm test` | Unit tests (Vitest), including the route-coverage guard. No database. |
| `pnpm test:int` | Integration tests against the local stack: the RLS suite, the catalog guard, the permission matrix, sign-in and the PgBouncer test. |
| `pnpm test:e2e` | Playwright: builds the app, seeds a `ping_e2e` database and runs the sign-in journey at laptop and phone size. Not part of `pnpm check`. |
| `pnpm test:related <files>` | Only the tests that import the given files. |

Run `pnpm check` before you push. To fix a failure, run its command on its own, since the output is shorter.

## Repo layout

```text
apps/
  server/          Hono app: /healthz, Better Auth, the API, serves the built SPA
    src/db/        the only place that opens database connections; schema and migrations
    src/system-actions/  the only user of the ping_system pool and of system functions
    src/test/      guards and harnesses: RLS suite, catalog guard, permission matrix
  web/             Vite + React SPA; talks to the server only through the typed hc client
packages/
  shared/          zod schemas and types used by both apps; never imports server code
e2e/               Playwright smoke journeys
scripts/           check:terms and the @ts-expect-error check
docs/spec/         the MVP spec
docs/adr/          architecture decisions
.claude/           Claude Code settings, hooks and path-scoped rules
.github/           CI workflow, PR template, master ruleset
compose.yaml       local Postgres, PgBouncer and MinIO
```

## Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | 5173 in dev, 3000 in `start` | The port you open: Vite in `pnpm dev`, Hono in `pnpm start` and production. |
| `SERVER_PORT` | 3000 | Hono's port during `pnpm dev`. Vite forwards `/healthz` and `/api` to it. |
| `WEB_DIST_DIR` | `apps/web/dist` | Where `pnpm start` looks for the built app. |
| `DATABASE_URL` | `ping_app` through local PgBouncer | The app's request role. Required in production. |
| `SYSTEM_DATABASE_URL` | `ping_system` through local PgBouncer | The role for work with no signed-in Staff member. Required in production. |
| `MIGRATION_DATABASE_URL` | the local owner, `ping` | Migrations and the dev seed only. The running app never uses it. |
| `BETTER_AUTH_URL` | `http://localhost:$PORT` | The URL people open. Required in production. |
| `BETTER_AUTH_SECRET` | a local-only value | Signs sessions. Required in production. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | the auth URL plus ports 5173 and 3000 | Origins allowed to call the auth routes, comma-separated. |

Set these in your shell, for example `PORT=4000 pnpm start`, or in a gitignored `.env.local` at the repo root, which the server and the db scripts load. Shell variables win. With `NODE_ENV=production` (as `pnpm start` sets) the server refuses to start without the required ones. `.env` and `.env.*` are gitignored, except `.env.example`.

## Working with Claude Code

The repo carries its own Claude Code setup, so every session and worktree gets the same guard rails:

- **After every edit,** Biome formats and lints the file. In `apps/web/`, Impeccable's design detector runs too.
- **Before Claude stops,** the Stop gate runs the checks above plus the tests related to the changed files. It needs `pnpm db:up`.
- **Applied migrations are locked.** A hook blocks edits to any migration that's already on `origin/master`.
- **Guard files need your approval.** Edits to lint and type configs, the banned-terms list, hooks and CI workflows ask first. Deploys, merges, pushes to `master` and reading `.env` files are denied.

`CLAUDE.md` has the workflow Claude follows, and `.claude/rules/` has checklists for migrations, server routes and the web app.

## Pull requests and CI

- Branches are named `<issue#>-<slug>`, and every change reaches `master` through a pull request.
- `.github/pull_request_template.md` sets the PR body.
- The CI job is called `check`. Once the `master` ruleset is applied, a merge needs `check` to pass. The ruleset also blocks force pushes and deleting `master`. `.github/rulesets/README.md` has the command to apply it.
- Renovate opens grouped dependency updates every Monday.

## Further reading

- `GLOSSARY.md`: the domain language.
- `docs/spec/`: what Ping does, its screens, data model, permissions, platform and testing strategy.
- `docs/adr/`: why the stack and permission model look the way they do.
