# Which stack and EU hosting can run Ping for close to €0?

Research for [#2](https://github.com/Patchalv/obs/issues/2), part of the map in [#1](https://github.com/Patchalv/obs/issues/1). Researched on 2026-11-12.

**Question.** Which framework, database, auth, real-time and hosting combination can run Ping for about 20 Staff members? It has to meet three constraints:

- EU data residency.
- Close to €0 a month, with a hard cap of €50.
- One person can maintain it through Claude Code sessions.

**Short answer.** Use **Supabase in an EU region (Frankfurt) with a static TypeScript React SPA**, plus an EU-hosted SMTP provider (Brevo) for auth emails. It's the only option where invites, password reset, per-user live updates and file storage are all built in. It also runs at €0 on the free plan. You pay for that with two things:

- The free plan has no automatic backups and pauses after a week of inactivity.
- Moving to Supabase Pro ($25/mo) removes both and still fits the cap.

Avoid Next.js on Vercel and Netlify on their free plans:

- Vercel Hobby is non-commercial only.
- Netlify Free can't move functions out of Ohio.

**Notes on the sources.**

- Prices are in USD excluding VAT unless stated.
- Every URL was accessed on 2026-11-12.
- Claims from official docs or pricing pages are marked **[primary]**. Vendor marketing or blog snippets are marked **[vendor-secondary]**. Community reports are marked **[anecdotal]**. Judgements are marked **[judgement]**.

---

## The options compared

| | **A. Supabase EU + static SPA** | **B. Neon EU + Node server + Better Auth** | **C. Cloudflare Workers + D1 + Durable Objects + R2** |
|---|---|---|---|
| Realistic monthly cost | **$0** on Free; $25 on Pro | ~$2–5 (Node host) + $0 Neon | $0 on Free; **$5** on Workers Paid (likely needed) |
| Auth | Built in: invites, reset, admin API | Better Auth library; you build the invite flow | Better Auth or hand-rolled; CPU limit risk on Free |
| Auth email | Custom SMTP required (Brevo) | Your code sends it (Brevo) | Brevo, or CF Email Sending (Paid, beta) |
| Live updates | Supabase Realtime Broadcast from DB triggers | SSE or WebSocket from your Node process | Durable Object WebSockets with hibernation |
| Files | Supabase Storage, 1 GB free | R2 EU bucket (10 GB free) or Neon Object Storage | R2 EU bucket, 10 GB free |
| Backups | None on Free; daily, kept 7 days, on Pro | 6 h history window on Free; DIY dumps | D1 Time Travel, 7 days on Free, 30 on Paid (automatic) |
| Pauses / sleeps | Project paused after 1 week inactive | Neon suspends after 5 min idle (cold start); host may auto-stop | Nothing pauses; daily quotas reset at 00:00 UTC |
| EU data at rest | Region `eu-central-1` etc. | Neon `aws-eu-central-1` + Fly `fra` / Railway Amsterdam | `eu` jurisdiction for D1, DO and R2 |
| Lock-in | Medium (plain Postgres; auth/realtime/storage are Supabase APIs) | Low (Postgres + open-source library) | High (D1, DO and Workers APIs) |
| Agent familiarity | High | High for the parts; more glue code | Medium |

---

## Option A: Supabase (EU) with a static TypeScript SPA

**Shape.** A Vite + React + TypeScript single-page app talks straight to Supabase:

- Supabase Postgres, with row-level security (RLS) as the permission layer.
- Supabase Auth.
- Supabase Realtime.
- Supabase Storage.

One Supabase Edge Function handles admin-only actions such as inviting a Staff member. The built SPA is static files, so any free static host works, such as Cloudflare Workers static assets or Pages. The static files contain no personal data.

**Regions.** Supabase offers EU-member regions in Ireland (`eu-west-1`), Paris (`eu-west-3`), Frankfurt (`eu-central-1`) and Stockholm (`eu-north-1`). The "Europe" grouping also includes London and Zurich, which aren't in the EU, so pick deliberately. Supabase itself warns that region choice "is a data-location control, not proof of regulatory compliance." [primary] — https://supabase.com/docs/guides/platform/regions

### Auth and email

- **Invites and admin calls.** `supabase.auth.admin.inviteUserByEmail(email)` sends an invite link [primary] — https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail. Every `auth.admin` method needs the secret key and "should be called on a trusted server" [primary] — https://supabase.com/docs/reference/javascript/admin-api. For Ping, that means a small Edge Function that checks the caller is an Admin.
- **Edge Function region.** Edge Functions run "in the region closest to the user making the request" by default. Pin them to the EU with the `x-region` header, the client `region` option, or `forceFunctionRegion` [primary] — https://supabase.com/docs/guides/functions/regional-invocation
- **Password reset.** Self-service password reset is built into Supabase Auth.
- **Custom SMTP is mandatory.** The built-in email service delivers only to project team members, at "2 messages per hour", with no SLA. Supabase "urge[s] all customers to set up custom SMTP." With custom SMTP, the default limit is 30 messages an hour, and you can change it. The docs list Brevo, Resend, AWS SES, Postmark, SendGrid and ZeptoMail as providers [primary] — https://supabase.com/docs/guides/auth/auth-smtp

### Live updates (Pings)

Supabase Realtime has three modes: Broadcast, Presence and Postgres Changes [primary] — https://supabase.com/docs/guides/realtime. For database-driven events, Supabase recommends Broadcast from a trigger as "the recommended method for scalability and security." The pattern works like this:

1. An `after insert/update/delete` trigger calls `realtime.broadcast_changes()` to a topic such as `ping:user:<id>`.
2. An RLS policy on `realtime.messages` controls who may receive it.
3. The client subscribes to that private channel [primary] — https://supabase.com/docs/guides/realtime/subscribing-to-database-changes

This fits per-user Pings well.

**Free limits.** 200 concurrent connections and 2 million messages a month [primary] — https://supabase.com/pricing. Twenty staff with a few tabs each use a small fraction of that.

**Unknown.** The docs I read don't say where Realtime servers process messages for an EU project. Ask Supabase or check their DPA before treating Realtime as EU-only processing.

### Files

Supabase Storage on Free gives 1 GB with a 50 MB maximum upload, plus 5 GB egress (and another 5 GB of cached egress) [primary] — https://supabase.com/pricing. That's plenty for occasional attachments. Storage is governed by the same RLS model as the rest of Ping.

### Backups

- **Free plan.** No automatic backups. Supabase recommends Free projects export regularly with `supabase db dump` or `pg_dump` and keep the copies off-site [primary] — https://supabase.com/docs/guides/platform/backups
- **Pro plan.** Daily backups kept for 7 days. Point-in-time recovery is an add-on from about $100/mo [primary] — same page.
- **Keep dumps in the EU.** A dump is personal data, so it has to stay in the EU. Write it to an R2 bucket created with the `eu` jurisdiction, which "guarantee[s] objects in a bucket are stored within a specific jurisdiction" [primary] — https://developers.cloudflare.com/r2/reference/data-location/
- **Run the dump from an EU machine.** GitHub-hosted Actions runners aren't guaranteed to run in the EU [judgement].

### Free tier, what pauses, and cost

**Free plan** [primary] — https://supabase.com/pricing:

- 500 MB database
- 1 GB file storage
- 5 GB egress
- 50,000 monthly active users
- 2 active projects
- 1-day log retention

**What pauses.** "Free projects are paused after 1 week of inactivity." During a school holiday that could take Ping offline until someone restores it. The pricing page doesn't define "inactivity" precisely.

**Pro.** $25/mo, including $10 of compute credit. Pro has a configurable Spend Cap: once a usage item hits its quota, further use "is disallowed until the next billing cycle" instead of being charged [primary] — https://supabase.com/docs/guides/platform/cost-control

**If you want Next.js.** Vercel Hobby can't be used. The terms say "You shall only use the Services under a Hobby plan for your personal or non-commercial use" [primary] — https://vercel.com/legal/terms (section 4). A company's internal tool very likely counts as commercial [judgement]. Vercel Functions also default to Washington D.C. (`iad1`), so you would have to set `fra1` or `cdg1` [primary] — https://vercel.com/docs/functions/configuring-functions/region. Vercel Pro costs $20 per developer seat [primary] — https://vercel.com/docs/plans/hobby, so Supabase Pro plus Vercel Pro comes to $45 before VAT, right at the cap.

Netlify Free is no alternative: functions run in Ohio (`cmh`), and only Pro and Enterprise can change region [primary] — https://docs.netlify.com/build/functions/optional-configuration/. The static SPA avoids all of this.

### Lock-in and agent familiarity

- **Lock-in.** The data is ordinary Postgres and can be dumped and moved. Auth (the `auth` schema), RLS-driven Realtime and Storage are Supabase-specific, so leaving would mean rewriting those three parts. Medium lock-in [judgement].
- **Agent familiarity.** Supabase plus React with TypeScript is one of the most common stacks in training data and tutorials. There is also a Supabase MCP server for Claude Code. High [judgement].

---

## Option B: Neon (EU) Postgres with a Node host and Better Auth

**Shape.**

- A TypeScript Node server (Hono, Express or Next.js standalone) on Fly.io or Railway in the EU.
- Neon Postgres in Frankfurt.
- Better Auth for sessions and passwords.
- Server-Sent Events or WebSockets for live updates.
- Files in an EU R2 bucket.

**Regions.** Neon's only EU-member region is Frankfurt, `aws-eu-central-1`. London is also offered, but the UK isn't in the EU. The region can't be changed after creation [primary] — https://neon.com/docs/introduction/regions

**Neon Free plan** [primary] — https://neon.com/pricing:

- 100 CU-hours of compute per project per month
- 1 GB storage per project (20 GB across the account)
- 5 GB egress
- Scale to zero after 5 minutes idle, which can't be turned off
- A 6-hour point-in-time history window
- If compute or egress runs out, compute is suspended until the next period. Data isn't deleted.

The paid Launch plan is usage-based, at $0.106 per CU-hour.

**Scale to zero and live updates.** Compute "scales to zero after an inactive period of 5 minutes" [primary] — https://neon.com/docs/introduction/scale-to-zero. The page doesn't say whether an idle `LISTEN` connection counts as activity. If it does, an always-on Node process holding one keeps compute awake: at 0.25 CU, about 730 hours a month is roughly 180 CU-hours, which exceeds the 100 free [judgement, unverified]. The safe design is a single Node instance that fans out Ping events in-process to its own SSE clients, with no `LISTEN`. That design also means no horizontal scaling, which is fine at this size.

### Auth and email

- **Password reset.** Better Auth's email and password mode calls a `sendResetPassword({ user, url, token })` function that you write. You send the email yourself, and the docs advise not to await it, to avoid timing attacks. `sendVerificationEmail` and `requireEmailVerification` are also available [primary] — https://better-auth.com/docs/authentication/email-password
- **Admin features.** The Admin plugin covers creating users, roles, banning (which also revokes sessions), listing users and impersonation. It has **no invitation flow**, so you'd build invites yourself, for example as an admin-created user plus a "set your password" reset link [primary] — https://better-auth.com/docs/plugins/admin
- **Managed variant.** Neon also offers *Managed Better Auth*. It stores auth data in the `neon_auth` schema of your own database and is included on Free up to 60k MAU [primary] — https://neon.com/docs/auth/overview, https://neon.com/pricing. Its default sender, `auth@mail.myneon.app`, "is rate-limited and does not support verification links," so production needs custom SMTP [primary] — https://neon.com/docs/auth/production-checklist

### Node host (there is no free tier in the EU)

- **Fly.io.** "New organizations don't have a free tier." Trial credit is $1. A `shared-cpu-1x` costs $2.19/mo at 256 MB or $3.69/mo at 512 MB in US regions, and Frankfurt costs more. For example, a 1 GB machine is $7.73 in `fra` against $6.70 in `iad`. A stopped machine bills only for its root filesystem, at $0.15/GB/mo [primary] — https://docs.fly.io/about/pricing
- **Railway.** Free gives $1 of credit a month, with a 0.5 GB / 1 vCPU cap per service. Hobby is $5/mo, including $5 of usage [primary] — https://railway.com/pricing. EU region: "EU West Metal", Amsterdam [primary] — https://docs.railway.com/reference/deployment-regions

### Files and backups

- **Files.** Use an R2 bucket in the EU jurisdiction (see Option C). The free tier is 10 GB-month with free egress [primary] — https://developers.cloudflare.com/r2/pricing/. Neon also includes Object Storage (5 GB per project on Free) [primary] — https://neon.com/pricing.
- **Backups.** The 6-hour history window isn't a real backup, so you'd need scheduled dumps to EU storage, the same as Option A on Free.

### Neon's newer extras

Neon now bundles Functions, Object Storage and Realtime as well. Realtime is "in beta" [primary] — https://neon.com/pricing. That could become an all-in-one alternative to Supabase, but it is new, and agents know it much less well [judgement].

### Lock-in and agent familiarity

- **Lock-in.** Lowest of the three: plain Postgres, an open-source auth library, and a portable Node process [judgement].
- **Agent familiarity.** Each part is well known, but there is the most glue code to own: invite flow, email sending, SSE fan-out, upload signing and backups. That's more surface area for a solo maintainer [judgement].

---

## Option C: Cloudflare Workers with D1, Durable Objects and R2

**Shape.**

- A Workers app in TypeScript, with Hono or React Router.
- A D1 (SQLite) database created with `--jurisdiction=eu`.
- A Durable Object namespace restricted to `eu` that holds each user's WebSocket connections.
- An R2 bucket in the EU jurisdiction.
- Better Auth, which has D1 adapters, or a hand-rolled auth layer.

### EU residency

- **D1.** Jurisdictions create databases that "only run and store data within a region." The jurisdiction must be set at creation, and replicas stay inside it [primary] — https://developers.cloudflare.com/d1/configuration/data-location/
- **Durable Objects.** `env.NS.jurisdiction("eu")` is supported [primary] — https://developers.cloudflare.com/durable-objects/reference/data-location/
- **R2.** EU jurisdiction is guaranteed [primary] — https://developers.cloudflare.com/r2/reference/data-location/
- **Caveat.** The Worker itself runs at whichever Cloudflare edge location receives the request. EU-only processing (the Data Localization Suite) is an "Enterprise-only paid add-on" [primary] — https://developers.cloudflare.com/data-localization/. For staff in Spain, traffic will normally hit EU locations, but that isn't contractually guaranteed [judgement].

### Free tier

**Workers Free** [primary] — https://developers.cloudflare.com/workers/platform/pricing/:

- 100,000 requests a day
- **10 ms of CPU per invocation**
- Workers Paid starts at a $5/mo minimum

**Durable Objects on Free** (SQLite backend only): 100k requests a day, 13,000 GB-s a day, and 5 GB stored [primary] — same page.

**D1 on Free** [primary] — https://developers.cloudflare.com/d1/platform/pricing/:

- 5 million rows read a day
- 100,000 rows written a day
- 5 GB of storage
- Past those limits, queries fail until 00:00 UTC.

**R2 on Free.** 10 GB-month of storage, 1M Class A and 10M Class B operations, and free egress [primary] — https://developers.cloudflare.com/r2/pricing/

Nothing sleeps or pauses.

### Live updates

A Durable Object can hold WebSockets using the Hibernation API. "Billable Duration (GB-s) charges do not accrue during hibernation." That suits idle-but-connected staff browsers [primary] — https://developers.cloudflare.com/durable-objects/best-practices/websockets/

### Auth and email

- **CPU limit.** Better Auth hashes passwords with scrypt by default. Community reports describe "Worker exceeded CPU time limit" errors on sign-up under the 10 ms Free limit [anecdotal] — https://answeroverflow.com/m/1344293536778031144 and https://better-auth.com/docs/reference/security. Workers Paid lets you raise CPU time (configurable `cpu_ms`) [primary] — https://developers.cloudflare.com/changelog/2025-03-25-higher-cpu-limits/. Plan on **$5/mo Workers Paid** rather than weakening hashing [judgement].
- **Invites.** You build the invite and reset flows yourself, as in Option B.
- **Email.**
  - Cloudflare Email Sending can send to arbitrary recipients, but "requires Workers Paid" and is **Beta** [primary] — https://developers.cloudflare.com/email-service/
  - It includes 3,000 emails a month, then $0.35 per 1,000 [primary] — https://developers.cloudflare.com/email-service/platform/pricing/
  - Its docs don't state where email data is processed or stored, so Brevo is the safer choice for residency.

### Backups

D1 Time Travel "is always on" and restores to any minute within 7 days on Free or 30 days on Paid [primary] — https://developers.cloudflare.com/d1/reference/time-travel/. This is the best automatic backup story of the three at $0. It stays inside Cloudflare, so an occasional `wrangler d1 export` to another EU location is still worthwhile [judgement].

### Lock-in and agent familiarity

- **Lock-in.** Highest. D1 is SQLite with Cloudflare-specific bindings, Durable Objects have no portable equivalent, and the runtime is Workers rather than Node [judgement].
- **Agent familiarity.** Agents know Workers well. They are less fluent with Durable Object WebSocket hibernation, D1 migrations and Workers-specific limits, so expect more debugging sessions [judgement].

---

## Transactional email (applies to every option)

| Provider | Free allowance | Where data lives | Verdict |
|---|---|---|---|
| **Brevo** (France) | 300 emails/day (about 9,000 a month), API and SMTP [vendor-secondary] — https://www.brevo.com/free-smtp-server/ | Servers in the EU: OVH in France and Germany, Google Cloud in Belgium. Some group companies outside the EU have support access [vendor-secondary] — https://help.brevo.com/hc/en-us/articles/360001005510-Data-storage-location | **Use this.** Ping sends a few invite and reset emails a month. |
| Mailjet | 6,000 a month, 200 a day; Free sends carry Mailjet branding [primary] — https://www.mailjet.com/pricing/ | Not checked | Fallback |
| Resend | 3,000 a month, 100 a day [primary] — https://resend.com/pricing | Can send from Ireland, but "All account data, including email metadata, logs, and API records, is stored in the United States" [primary] — https://resend.com/docs/dashboard/domains/regions | **Fails EU residency** |
| Cloudflare Email Sending | 3,000 a month on Workers Paid [primary] | Not stated | Only for Option C, and it's in beta |

Before relying on Brevo, check its current DPA and sub-processor list directly. The Brevo facts above come from search summaries of its help pages, because the pages themselves wouldn't render for the fetcher.

---

## Recommendation

**Option A: Supabase in Frankfurt (`eu-central-1`) with a Vite + React + TypeScript SPA on a free static host, and Brevo as the SMTP provider for Supabase Auth.**

Why:

- **It does the most for you.** Invites, password reset, sessions, row-level permissions, per-user live Pings (Broadcast from triggers plus RLS on `realtime.messages`) and attachments all come with the platform. The only server code is one EU-pinned Edge Function for admin invites. That's the fewest moving parts for a solo, agent-driven build.
- **Agents know it best.** Supabase plus React plus TypeScript has the highest agent familiarity of the three.
- **It starts at €0** and has a clear €25/mo upgrade that fixes both free-plan weaknesses.

Main trade-offs and what to do about them:

1. **No backups on Free.** Run a scheduled `supabase db dump` from an EU machine into an R2 bucket in the EU jurisdiction. Alternatively, accept $25/mo for Pro's daily backups once Ping holds real data.
2. **Pause after a week of inactivity on Free.** Over the August or Christmas break, Ping could be paused. Pro removes this. With Pro plus the Spend Cap, the bill is fixed at about $25 before VAT, half the cap.
3. **Don't add Next.js on Vercel.** Hobby forbids commercial use, so Next.js would add $20/mo and a second platform. If server rendering is ever needed, put it on an EU-region host, not Vercel Hobby or Netlify Free.
4. **Unknown: where Realtime processes messages.** Confirm with Supabase or their DPA.
5. **Lock-in is moderate.** Leaving later means rewriting auth, realtime and storage calls. The Postgres data itself is portable.

**When to choose the others.**

- **Option C (Cloudflare)** if you want automatic backups and no pausing for $0–5/mo, and you accept more custom auth code and the highest lock-in.
- **Option B (Neon + Node + Better Auth)** if portability matters most. It costs a few euros a month for the EU Node host and has the most glue code to maintain.
