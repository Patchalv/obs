# A portable, near-zero-cost EU stack: Neon Postgres + one Hono Node app on Fly.io Frankfurt

**Status:** accepted

Ping is a side project run by one person, and its threads hold employee and child PII. Every choice is therefore weighed against three principles: minimal cost (close to €0, hard cap €50/month), portability (plain open pieces we can leave without a rewrite), and security with EU data residency.

## Decision

- **Database:** Postgres on Neon, Frankfurt (`aws-eu-central-1`), free plan.
- **App:** one TypeScript Node container built on Hono. It serves the API, the live updates and the static Vite + React SPA. It runs on Fly.io in Frankfurt as exactly one `shared-cpu-1x` Machine, with high availability and autostop both turned off.
- **Auth:** the Better Auth library. Auth data lives in our own Postgres tables.
- **Data access:** Drizzle, with SQL migrations.
- **Live updates:** Server-Sent Events, fanned out in memory by that single instance.
- **Email:** any SMTP provider set through config. We start with Brevo.
- **Repo:** a pnpm TypeScript monorepo: `apps/web`, `apps/server`, `packages/shared`.

## Considered options

- **Supabase:** rejected. Its free plan has no backups and pauses after a week of inactivity, so it really means Pro at about €25–30/month. Its auth, realtime and storage APIs also lock us in.
- **Cloudflare Workers + D1:** rejected. Highest lock-in, and its CPU limits clash with password hashing.
- **Next.js on Vercel:** rejected. The free plan is non-commercial only, functions default to the US, and short-lived functions are a poor fit for long-lived SSE connections.
- **Resend for email:** rejected. It stores account data and logs in the US.
- **Other hosts:**
  - Northflank: EU region and DPA unconfirmed.
  - Render Starter: $7/month from day one.
  - A self-managed Hetzner or OVH VPS: patching and TLS would become our security burden.
  - Oracle Always Free: reclaims idle instances.

## Consequences

- **Run exactly one instance.** Live updates are fanned out in memory, so a second instance would silently miss users. Scaling out later needs a message relay between instances.
- **Keep the server streaming.** The server sends an SSE heartbeat every 20–30 seconds, and clients resume with `Last-Event-ID`.
- **Let Neon sleep.** No permanent `LISTEN` connection, and a health check that never touches the database.
- **Stay under Fly's $5 waiver.** Fly waives personal-org bills under $5, which keeps the cost at about €0, but a bill of $5 or more is paid in full. Card required.
- **Leaving is mechanical.** Moving off any vendor means a `pg_dump`/restore plus redeploying the same Docker image.
- **Research:**
  - `research/ping-stack-and-hosting`: [Which stack and EU hosting can run Ping for close to €0?](https://github.com/Patchalv/ping/issues/2)
  - `research/ping-eu-hosting`: [Which EU host should run Ping's Node app?](https://github.com/Patchalv/ping/issues/10)

## Amendment (2026-11-14): Fly sizing and the Neon plan

Prices were checked again before the build, and two numbers in this ADR's reasoning had moved.

- **Fly.** A `shared-cpu-1x` Machine with 512 MB in Frankfurt costs about $4.26 a month, not the $3.30 first assumed. With staging and the scheduled Machines, the bill would pass $5, and Fly then charges all of it. Prod therefore runs in 256 MB, about $2.53 a month. To make that fit, the server strips image metadata by cutting segments out of the file and never decodes an image. Moving to 512 MB waits until Spark agrees to pay. The waiver is now in Fly's pricing docs for personal organisations, but it's still not a promise.
- **Neon.** The free plan now gives 100 CU-hours a month, about 400 active hours at the smallest size, which covers the proof of concept. Neon's own production checklist says the free plan is for prototyping, running out of the allowance suspends the database until the next month, and it's unconfirmed whether Neon's DPA covers free-plan users. Ping moves to the Launch plan at go-live, about $6 a month with no minimum fee, paid by Spark.

Sources, read on 2026-11-14: [Fly pricing](https://docs.fly.io/about/pricing), [Fly cost management](https://docs.fly.io/about/cost-management), [Neon plans](https://neon.com/docs/introduction/plans), [Neon production checklist](https://neon.com/docs/get-started/production-checklist).
