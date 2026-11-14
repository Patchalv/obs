# Ping

Ping is Spark's internal staff tool for communication and work tracking: Channels, Threads, Thread Responses, Pings and Saved. `GLOSSARY.md` defines every term, and the code uses them as written there.

So far the repo has the foundations only. The server answers `/healthz` and serves a placeholder page. There's no database code, sign-in or product feature yet.

## Setup

You need:

- **Node 24.** `.nvmrc` pins it, so `nvm use` picks the right version.
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
pnpm dev
```

Open http://localhost:5173. The page should say "Server: ok", which means the React app reached the server through the typed client.

There are no secrets to set up yet. `.env.example` lists every environment variable the code reads, and each has a working default.

## Commands

### Running the app

| Command | What it does | Use it when |
| --- | --- | --- |
| `pnpm dev` | Starts Vite on 5173 and the Hono server on 3000 together. Vite serves the React app from source and forwards `/healthz` and `/api` to Hono. React updates in the browser as you save, and the server restarts when its files change. | You're building or trying out a feature. This is the everyday command. |
| `pnpm build` | Builds the React app into `apps/web/dist`. | Before `pnpm start`. |
| `pnpm start` | Starts Hono alone on 3000. It serves the built app, its assets and the API from one process, the way the production container does. Nothing reloads. | You want to check the production shape: the built app loads, a refresh on a deep link like `/channels/123` still loads the app, and `/api/*` never returns the page. |

`pnpm start` without a build serves `/healthz` only. Rebuild after every change you want to see there.

### Local services

| Command | What it does |
| --- | --- |
| `pnpm db:up` | Starts Postgres, PgBouncer and MinIO in Docker (`docker compose up -d --wait`) and waits until all three are healthy. |
| `pnpm db:down` | Stops them and removes the containers (`docker compose down`). The data volumes stay, so the next `db:up` starts where you left off. |

The app doesn't use the database yet, so `pnpm dev` works without these. The integration tests and Claude Code's Stop gate need them running.

Every worktree shares one stack. The Compose project is named `ping` whichever folder you run it from.

| Service | Address | Login |
| --- | --- | --- |
| Postgres 18 | `localhost:5432` | `ping` / `ping`, database `ping` |
| PgBouncer (transaction mode) | `localhost:6432` | same as Postgres |
| MinIO S3 API | `localhost:9000` | `ping` / `ping-minio-local` |
| MinIO console | http://localhost:9001 | same as the S3 API |

Postgres is pinned to 18 to match Neon. PgBouncer runs in transaction mode like Neon's pooler, so session state never carries over between transactions. The app will connect through it. MinIO stands in for Cloudflare R2.

To open a Postgres shell through PgBouncer:

```bash
docker compose exec postgres psql "postgres://ping:ping@pgbouncer:6432/ping"
```

### Checks

`pnpm check` runs everything below in order and stops at the first failure. CI runs the same checks plus `pnpm audit` on every pull request, and they must pass before a merge.

| Command | What it catches |
| --- | --- |
| `pnpm typecheck` | Type errors in every package (`tsc -b`, strict settings from `tsconfig.base.json`). |
| `pnpm lint` | Formatting and lint problems (Biome), including `any` and `@ts-ignore`. It also fails on an `@ts-expect-error` with no reason after it. |
| `pnpm lint:fix` | Fixes whatever Biome can fix on its own, mostly formatting and import order. |
| `pnpm lint:types` | Unawaited promises, promises passed where a callback can't handle them, and `switch` statements that miss a case (type-aware ESLint, three rules only). An unawaited query can run outside its transaction, which is why these matter. |
| `pnpm knip` | Unused files, exports and dependencies. |
| `pnpm depcruise` | Imports that cross the boundaries: raw database drivers outside `apps/server/src/db/`, the system pool outside `system-actions/`, runtime server code in `apps/web`, and server code in `packages/shared`. |
| `pnpm check:terms` | Banned words in identifiers, file names and migration SQL, such as `ticket`, `notification` or `todo`. The list and its exceptions are in `check-terms.config.json`. Use the `GLOSSARY.md` term instead. |
| `pnpm test` | All unit tests (Vitest). |
| `pnpm test:related <files>` | Only the tests that import the given files. |

Run `pnpm check` before you push. To fix a failure, run its command on its own, since the output is shorter.

## Repo layout

```text
apps/
  server/          Hono app: /healthz, the API, serves the built SPA
  web/             Vite + React SPA; talks to the server only through the typed hc client
packages/
  shared/          zod schemas and types used by both apps; never imports server code
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

Nothing loads `.env` files yet, so set these in your shell, for example `PORT=4000 pnpm start`. Loading `.env.local` comes with the database work. `.env` and `.env.*` are gitignored, except `.env.example`.

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
