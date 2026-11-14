# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Ping** is Spark's internal staff tool for communication and work tracking (Channels, Threads, Thread Responses, Pings, Saved). It is a new product inspired by TECS Obs (OBS 2.0), a Classic ASP case-tracking app, but it shares no data, terminology or design with it.

- `GLOSSARY.md`: the canonical domain language. Use its terms in code, issues, tests and docs, and avoid the synonyms it lists under _Avoid_ (for example: Thread, not ticket or post; Ping, not notification; Thread Response, not reply; Deactivated, not deleted). `pnpm check:terms` fails on the worst offenders.
- `OBS_REVERSE_ENGINEERING.md`: read-only notes on how TECS Obs works, with each claim tagged Observed, Inferred or Unknown. Treat it as background research, not a spec. Its Spanish/Obs vocabulary (observación, seguimiento, responsable, recado) must not leak into Ping's code or docs.
- `docs/spec/`: the MVP spec (product, screens, data model, permissions, platform, testing, go-live).
- `docs/adr/`: architecture decisions, created as they are made.

## Commands

A pnpm monorepo: `apps/web` (Vite + React), `apps/server` (Hono on Node), `packages/shared` (zod schemas and types).

- `docker compose up -d`: the shared local stack (Postgres 18, PgBouncer in transaction mode, MinIO). One stack serves every worktree.
- `pnpm dev`: Vite on 5173 and Hono on 3000 together. Vite proxies `/healthz` and `/api` to Hono.
- `pnpm build`, then `pnpm start`: Hono serves the built SPA and `/healthz`.
- `pnpm test`: all unit tests (Vitest). `pnpm test:related <files>` runs the tests that touch those files.
- `pnpm check`: everything CI runs except `pnpm audit`: `typecheck` (`tsc -b`), `lint` (Biome), `lint:types` (type-aware ESLint), `knip`, `depcruise`, `check:terms`, `test`.

## Workflow

- One issue per session, with `/clear` or a new session between issues. Build with `/mattpocock-skills:implement`.
- Every slice runs in its own worktree on a branch named `<issue#>-<slug>`. `.worktreeinclude` copies `.env.local`.
- One slice at a time until the exemplar slice ("create a Channel and open it") is merged; after that, up to two in parallel.
- Hooks: Biome runs after every edit (plus Impeccable's detector in `apps/web/`). The Stop gate runs `tsc -b`, Biome, ESLint, Knip, dependency-cruiser, `check:terms` and `vitest related` on changed files, and needs `docker compose up -d`. Edits to migrations already on `origin/master` are blocked.
- Any slice touching `apps/web` starts `ping-dev` from `.claude/launch.json` and checks the change in the browser before the PR.
- **Opening the PR:** after `/implement`, push and open a **ready** PR without asking when every local suite is green, the Stop gate passes and every hard `code-review` violation is fixed. Write the body with the `pr` skill, fill `.github/pull_request_template.md` and say `Closes #n`. Otherwise open a **draft** PR that says what blocks it.
- **After opening:** turn on Auto-fix and answer Patrick's PR comments, CI failures and conflicts. Never merge; Patrick merges. Never deploy.

## Gotchas

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `Patchalv/ping`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
