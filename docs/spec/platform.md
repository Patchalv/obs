# Platform and operations

Stack, hosting, email, deploys, backups, monitoring and security. Every account is Patrick's during the proof of concept.

## Stack

Recorded in [ADR 0001](../adr/0001-portable-low-cost-eu-stack.md):

- **Database:** Postgres on Neon, Frankfurt (`aws-eu-central-1`). Free plan for the proof of concept, Launch plan from go-live.
- **App:** one TypeScript Node container built on Hono. It serves the API, the live-update stream and the static Vite + React SPA.
- **Auth:** Better Auth, with its data in Ping's own Postgres. No admin plugin.
- **Data access:** Drizzle, with SQL migrations.
- **Rich text:** TipTap in the browser, ProseMirror JSON in the database.
- **Live updates:** Server-Sent Events, fanned out in memory by the single app instance.
- **Attachments:** Cloudflare R2, in EU-jurisdiction buckets, used only through a thin S3-client module in the server. Moving elsewhere is a config change plus an object copy.
- **Email:** any SMTP provider through config, starting with Brevo.
- **Repo:** a pnpm TypeScript monorepo:
  - `apps/web`: the Vite + React SPA;
  - `apps/server`: the Hono app;
  - `packages/shared`: zod schemas and types. The front end calls the server through Hono's typed client.

### Consequences to respect

- **Run exactly one app instance.** Live updates and the auth rate limiter are in memory, so a second instance would silently miss users.
- **Keep the stream alive.** A heartbeat every 20–30 seconds, and clients resume with `Last-Event-ID`.
- **Let Neon sleep.** No permanent `LISTEN` connection, and a health check that never touches the database.
- **Leaving any vendor is mechanical:** a `pg_dump` and restore, an object copy, and redeploying the same Docker image.

Sources: [Which stack and EU hosting can run Ping for close to €0?](https://github.com/Patchalv/ping/issues/2), [Which EU host should run Ping's Node app?](https://github.com/Patchalv/ping/issues/10), [Choose Ping's stack and hosting](https://github.com/Patchalv/ping/issues/3)

## Environments and domains

Patrick owns `bypatrick.app`, with DNS on Cloudflare. (The `bypatrick.com` mentioned in early tickets isn't his.)

| | Prod | Staging |
| --- | --- | --- |
| Host | `ping.bypatrick.app` | `staging.ping.bypatrick.app` |
| Fly app | `fra`, one `shared-cpu-1x` Machine, 256 MB, autostop off, HA off | its own app, 256 MB, autostop on |
| Database | Neon main branch | a `staging` Neon branch, reseeded with fake data, never branched from prod |
| Storage | its own R2 EU bucket | its own R2 EU bucket |
| Backups, uptime monitor, heartbeats | yes | no |

- Both are Fly custom domains with DNS-only (unproxied) Cloudflare records, so Fly handles TLS and the live-update stream isn't buffered.
- Both use Fly's shared IPv4 plus IPv6, never a dedicated IPv4.
- Prod runs in 256 MB to stay under Fly's $5 waiver (see [Cost](#cost)). The slice [Staging and prod deploy pipeline](https://github.com/Patchalv/ping/issues/30) measures memory on staging. Moving prod to 512 MB is a cost Spark is asked to cover first.

## Email

- Mail goes out as `Ping <no-reply@ping.bypatrick.app>`, with no Reply-To, through Brevo SMTP. The root domain's mail setup (Cloudflare Email Routing) is untouched.
- DNS on `ping.bypatrick.app`:
  - Brevo domain authentication: the DKIM CNAMEs and the Brevo code TXT;
  - SPF: `v=spf1 include:spf.brevo.com ~all`;
  - DMARC: `p=none`, with `rua` sent to Cloudflare DMARC Management.
- **Staging** uses the same Brevo account and sender, starts subjects with `[Staging]`, and links to the staging host. It only sends to addresses in `EMAIL_ALLOWLIST`; anything else is logged and not sent.
- **Deliverability check for the POC:** at least 9/10 on mail-tester.com, and a test invite that lands in a Gmail inbox.

Source: [How do the first Admins get in, and how do invite and reset emails arrive?](https://github.com/Patchalv/ping/issues/15#issuecomment-6863586131)

## Object storage

- R2 buckets are created with jurisdiction `eu`, which can't be changed later. You need one each for prod, staging and backups.
- S3 endpoint: `https://<account_id>.eu.r2.cloudflarestorage.com`, region `auto`.
- Every `wrangler r2` command on an EU bucket needs `--jurisdiction eu`. Without it you get a misleading "bucket not found".
- Each environment gets a token scoped to its own bucket.
- Object keys are random UUIDs; original filenames live only in Postgres.
- Downloads are signed GET links that expire in under 5 minutes, handed out only after the server's permission check.

Source: [Set up and verify an EU Cloudflare R2 bucket for Attachments](https://github.com/Patchalv/ping/issues/14#issuecomment-6863228101)

## Deploys

- **One GitHub Actions workflow** runs on every merge to `master`: all test suites, then migrations against staging, then a staging deploy, then the staging pooler smoke test ([testing.md](testing.md#pooler-behaviour)).
- **Promote** is a manual run on the same commit. It migrates and deploys prod, and is blocked if the staging smoke test failed.
- There's no Fly `release_command`.
- **Migrations** run from Actions as `neondb_owner`. They must stay backward-compatible with the previous release (expand first, contract in a later PR), because the old code briefly runs against the new schema.
- **First Admin:** after the first prod deploy, Patrick runs `bootstrap-admin` through `fly ssh console`.

## Secrets

- **GitHub** holds only the Fly deploy token and the `neondb_owner` database URLs.
- **`fly secrets`** holds every runtime secret, so the running app never has the owner credential:
  - the `ping_app` and `ping_system` database URLs;
  - the Better Auth secret;
  - Brevo SMTP credentials;
  - R2 keys;
  - the Sentry DSN.
- **Locally**, secrets go in a gitignored `.env.local`. `.gitignore` covers `.env` and `.env.*`, except `.env.example`.

## Backups (prod only)

- **Nightly**, a Fly scheduled Machine in `fra`:
  - runs `pg_dump`, encrypts it with `age`, and writes it to a separate R2 EU backup bucket through a write-only token. The backup job holds only the public key;
  - copies the Attachments bucket with `rclone sync --backup-dir`, into dated folders.
- Backups never run on GitHub-hosted runners, because those are US-hosted.
- **Retention:** dumps and Attachment backups are both kept 30 days, so anything deleted in Ping is gone from backups within 30 days.
- **Restore test:** a monthly Fly scheduled Machine decrypts the latest dump, restores it into a temporary Neon branch, checks row counts and deletes the branch.
- **The private key** therefore lives in two places: offline with Patrick, and as a Fly secret that only the restore-test Machine can read. That is a deliberate trade. A backup nobody tests is a worse risk than a decrypt key in Fly secrets.
- **Restore drill:** one manual drill before go-live, written up as a runbook.

## Monitoring

- **Uptime:** Better Stack (free) checks `/healthz` every 3 minutes. The endpoint never touches the database.
- **Heartbeats** (Better Stack) for:
  - the nightly backup;
  - the monthly restore test;
  - the file-deletion sweeper, the pending-upload sweeper and the `audit_event` retention sweeper;
  - a nightly quota check, which fails when R2 storage, Neon storage or Neon compute hours (read through the Neon API) pass 80% of the free tier, or when either sweeper's backlog passes a threshold.
- **Errors:** Sentry free, EU region, with `sendDefaultPii: false` and request bodies scrubbed. Prod and staging are separate Sentry environments.
- **Alerts** reach Patrick by email and through Better Stack's mobile push.

## Cost

Ping stays free, or close to it, until Spark agrees to pay for something.

- **Fly:** about $3 a month, under Fly's $5 waiver for personal orgs. Prod at 256 MB in Frankfurt is about $2.53 (Fly's $2.19 base price times its 1.154 Frankfurt multiplier, checked 2026-11-14). Staging, backup and restore add under $0.50 together. At 512 MB, prod alone would be about $4.26 and the total would pass $5.
- **The waiver** is in Fly's pricing docs but isn't a promise. A bill of $5 or more is paid in full, and Fly has no spend cap.
- **Runbook:** look at Fly usage on the first of each month. If the projection reaches $4.50, the first lever is turning staging off.
- **Neon:** free during the proof of concept. The free plan gives 100 CU-hours a month, about 400 active hours at the smallest size, and Ping's working-day use needs about 220. Running out suspends the database until the next month. From go-live Ping moves to the Launch plan, which has no minimum fee and should cost about $6 a month. Spark covers that.
- **R2, Brevo, Better Stack, Sentry:** free plans, watched by the quota check where they have limits.
- **Hard cap:** €50 a month across everything.

## Baseline security

- **Transport:** Fly `force_https` and Fly-managed TLS.
- **Headers:** Hono `secureHeaders` with a strict same-origin CSP. Sentry is the only third-party origin, since Attachments are served through the server.
- **Auth:** Better Auth's in-memory rate limiter on sign-in, password reset and invite routes, plus the per-email reset limit. Passwords are at least 12 characters and checked against known breaches. Cookies are `Secure` and `SameSite=Lax`.
- **Dependencies:** Renovate weekly with grouped updates, and `pnpm audit` in CI.
- **Logs** never contain message bodies or email addresses.
- **Audit log:** see [product.md](product.md#audit-log).

## GDPR

- The proof of concept runs on fake data only.
- Each vendor's DPA is accepted when its account is set up: Neon, Fly, Cloudflare (done), Brevo, Sentry and Better Stack.
- Real Spark data comes in only after the [go-live checklist](go-live.md) is complete.

Source: [How is Ping deployed, backed up and monitored?](https://github.com/Patchalv/ping/issues/12#issuecomment-6862919205)
