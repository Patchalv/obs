# Which EU host should run Ping's Node app?

Research for [#10](https://github.com/Patchalv/obs/issues/10), part of the map in [#1](https://github.com/Patchalv/obs/issues/1). Researched 2026-11-12 to 2026-11-13. It builds on [the earlier stack research](https://github.com/Patchalv/obs/blob/research/ping-stack-and-hosting/docs/research/ping-stack-and-hosting.md), and every price in it was checked again.

**Question.** Where should Ping's one always-on Docker container run? The container is a TypeScript Node (Hono) app that serves the API, the built React SPA and live updates over long-lived Server-Sent Events (SSE). It runs as a single instance against Neon Postgres in Frankfurt (`aws-eu-central-1`). The principles, in priority order:

1. Minimal cost: ideally about €0, with a hard cap of €50/month for the whole system.
2. Portability: plain Docker that is easy to move.
3. Strong security and EU data residency, which is mandatory because threads hold employee and child PII.

**Short answer.**

1. **Fly.io, one `shared-cpu-1x` Machine in `fra` (Frankfurt), autostop off, `--ha=false`.** It's billed at about $2.53 for 256 MB or $4.26 for 512 MB, and Fly waives a personal organization's bill when it comes to less than $5. In practice it's €0, managed, and sits in the same city as Neon.
2. **Northflank Sandbox (free, "always on, no sleeping") in `europe-west-frankfurt`**, if two things check out: that the free plan can use an EU region, and that a DPA is available. If both hold, it's a €0 managed option that doesn't need a card.
3. **Render Starter in Frankfurt ($7/mo, 512 MB).** The predictable paid managed fallback.
4. **Hetzner CPX02 (Nuremberg/Falkenstein, €6.49 + IVA) or OVHcloud VPS-1 (€3.81 + IVA).** The EU-owned VPS route: the cheapest per GB and the most portable, but you patch and firewall it yourself.

Every option runs the same Docker image, so moving from a €0 tier to a paid one if a free policy changes takes about an hour of work [judgement].

**Notes on the sources.**

- Unless stated otherwise, each URL was accessed on 2026-11-12.
- Each claim is tagged by where it comes from:
  - **[primary]**: official docs or pricing pages.
  - **[vendor-secondary]**: vendor blogs, marketing, or search-result summaries of vendor pages.
  - **[anecdotal]**: forums or third-party sites.
  - **[judgement]**: my own inference.
- Prices exclude VAT unless stated.
  - Spain charges **21% IVA**. A company account with a valid EU VAT ID is normally reverse-charged.
  - For conversion I use a planning rate of **$1 ≈ €0.86** [judgement; check on the day].
- "Always on" means 730 hours a month, or about 2.63 million seconds.

---

## Things that apply to every host

These shape the comparison, so they come before the table.

- **Sleeping is the real disqualifier, not stream duration caps.** A host that sleeps or scales to zero breaks live updates, because nothing is listening when a Ping is sent. Caps on request duration don't matter as long as the server sends a heartbeat comment (`:\n\n`) every 15–30 s and the browser's `EventSource` reconnects with `Last-Event-ID`. That covers Railway (15 min), Scaleway (60 min) and Render (about 100 min) [judgement]. Build this in anyway: deploys and restarts close every SSE connection on every host.
- **Pin to exactly one instance.** Fan-out over in-memory SSE silently breaks if a second instance starts, because a Ping sent through instance A never reaches clients connected to instance B. Each section below names the setting that pins the instance count [judgement].
- **Keep the health check off Postgres.** A `/healthz` that queries Neon every few seconds keeps Neon's compute awake around the clock. Have it return 200 from the process alone [judgement]. Similarly, a permanent `LISTEN` connection to Neon for fan-out would stop Neon from scaling to zero. Decide that in the realtime ticket, not here.
- **Residency versus sovereignty.** Neon already stores all the PII with a US-owned vendor on AWS Frankfurt. So for consistency, the bar for the app host is the same as Neon's:
  - its region can be pinned to the EU;
  - it has a GDPR Art. 28 DPA;
  - its own logs and metadata don't create a new problem.

  US ownership (CLOUD Act) is therefore **not** scored as a disqualifier. EU-owned hosts (Hetzner, OVHcloud, Scaleway) are noted as a bonus [judgement].
- **Logs are personal data too.** Whatever the host, don't log request bodies or thread content. Platform log retention is outside your control on a PaaS [judgement].

---

## Summary comparison

| Host (EU region) | Smallest always-on fit, monthly | Free tier really | Sleeps? | SSE limits | DPA | Ops burden | Latency to Neon `fra` | Lock-in |
|---|---|---|---|---|---|---|---|---|
| **Fly.io** (`fra`, `ams`, `cdg`, `arn`) | 256 MB ≈ **$2.53**; 512 MB ≈ **$4.26** in `fra` (calc.); **waived if the bill is under $5** | No free tier; under-$5 waiver for personal orgs, card required | Only if autostop is left on | ~60 s idle cutoff reported, so heartbeat | On request via support | Low (managed) | Same city, ~1–2 ms [judgement] | Low (Dockerfile + `fly.toml`) |
| **Northflank** (`europe-west-frankfurt`, NL, Zurich) | nf-compute-10 (256 MB) **$2.70**; nf-compute-20 (512 MB) **$5.40** | Sandbox: "up to $20/mo of resources", "always on, no sleeping", no card | No | Not documented | Not found publicly (UK company) | Low | Same city if the Frankfurt region is allowed | Low |
| **Render** (Frankfurt) | Starter **$7** (512 MB, <1 CPU) on the $0 Hobby workspace | Free web service | **Free sleeps after 15 min** | ~100 min max request [vendor-secondary] | Yes, via trust portal | Low | Reportedly AWS `eu-central-1` [anecdotal] | Low |
| **Railway** (Amsterdam only) | Hobby **$5** fee incl. $5 usage; 512 MB ≈ $5 RAM + CPU → **~$5.5** | $1/mo credit, too little for always-on | No (sleep is opt-in) | 15 min max, 5 min of silence closes | Public DPA | Low | Amsterdam, ~7–10 ms [judgement] | Low |
| **Scaleway Serverless Containers** (Paris, Amsterdam, Warsaw) | 250 mvCPU/512 MB always on ≈ **€6.40**; smaller sizes ≈ €2–3 | 400k GB-s + 200k vCPU-s (~9 days at 512 MB) | Only with min-scale 0 | 60 min max | Yes (EU company) | Low | Paris/Amsterdam ~8–12 ms [judgement] | Low |
| **Hetzner Cloud** (Nuremberg, Falkenstein, Helsinki) | CPX02 (1 vCPU, 1 GB) **€6.49** DE / €5.49 HEL, IPv4 incl. (CX23 €5.99 "currently unavailable") | None | No | None (you own the proxy) | Self-serve in console (EU company) | **High** (OS, firewall, proxy, TLS) | NBG/FSN a few ms; HEL ~25 ms [judgement] | Lowest |
| **OVHcloud VPS** | VPS-1 (2 vCore, 4 GB) **€3.81** (€4.61 incl. IVA) | None | No | None | Yes (EU company) | **High** | Depends on DC [judgement] | Lowest |
| **Cloudflare Containers** (`jurisdiction: "eu"`) | Workers Paid **$5** + lite (256 MiB) ≈ $1.7 → **~$6.7**; 1 GiB ≈ $12 | None (Free plan has no Containers) | Stops on inactivity timeout; "always on" not documented | Via Worker → Durable Object → container | Standard CF DPA | Medium (Worker + DO wrapper) | Anywhere in WEUR/EEUR | Medium |
| **Oracle Always Free** (Frankfurt, Madrid, Amsterdam, …; home region only) | €0: A1 Flex 2 OCPU/12 GB or 2× E2.1.Micro (1 GB) | Yes, permanent | No, but **idle instances reclaimed** | None | Oracle DPA | **High** | Frankfurt home region ~1–2 ms | Low |

**Disqualified for Ping as configured:**

- **Render Free** sleeps.
- **Koyeb Free** sleeps after 1 h.
- **Cloudflare Workers alone** would need a Durable Objects rewrite, which isn't plain Docker.

---

## Option by option

### 1. Fly.io

**Price.**

- No free tier for new organizations. But "if your personal organization's monthly bill comes to less than $5, we waive it" [primary] — https://docs.fly.io/about/pricing
- `shared-cpu-1x` costs $2.19/mo at 256 MB and $3.69/mo at 512 MB in the cheapest regions [primary]. Frankfurt is priced higher: the same page's example puts a 1 GB Machine at $7.73 in `fra` against $6.70 in `iad`. The page's embedded region table gives `fra` a markup of 1.1538 [primary, read from the page source].
- So `fra` comes to **≈ $2.53 (256 MB)** or **≈ $4.26 (512 MB)** [judgement, calculated from primary figures]. `ams` has a markup of 1.0385, giving ≈ $3.83 for 512 MB.
- Shared IPv4 and IPv6 are free, and a dedicated IPv4 is $2/mo [primary]. The first 10 single-hostname TLS certificates per organization are free [primary]. Outbound data costs $0.02/GB in Europe [primary].

**Free waiver details** [primary] — https://docs.fly.io/about/free-waiver

- It applies to the personal organization only.
- The organization must be on Pay As You Go with a card on file.
- Everything counts toward the $5, including Machines, volumes and data transfer.
- "If it's $5 or more, you pay the full amount." So it's a cliff, not a credit.
- The page doesn't say whether the threshold is before or after VAT, or whether the waiver can be withdrawn.

At 256–512 MB with Ping's traffic, the bill should land at $2.5–4.5, under the cliff [judgement]. Don't add a dedicated IPv4 or a volume, or the margin gets thin.

**Trial.** $1 of credit for 7 days, no card needed [primary].

**Does it sleep?** `fly launch` turns on automatic stop and sets the minimum running Machines to zero for new apps. It also creates **two** Machines by default [primary] — https://docs.fly.io/reference/app-availability. Ping must:

- use `fly launch --ha=false` or `fly scale count 1`;
- set `auto_stop_machines = "off"` and `min_machines_running = 1` in `fly.toml` [primary for the behaviour; check the key names in the config reference].

**SSE.**

- Community threads describe a 60-second idle cutoff on Fly's proxy. A staff reply says streams survive as long as data is sent within 60 s [anecdotal] — https://community.fly.io/t/60s-timeout-on-server-sent-events/13152
- `fly.toml` documents `http_options.idle_timeout` [primary] — https://docs.fly.io/reference/configuration
- A 20–30 s heartbeat makes this a non-issue [judgement].

**EU regions.** `ams`, `arn`, `cdg`, `fra`, `lhr` [primary] — https://docs.fly.io/reference/regions/

**DPA.**

- Fly publishes a sub-processor list that refers to section 6.3 of its DPA [primary] — https://fly.io/legal/sub-processors/
- You get the DPA by emailing support, and one user reported friction getting it on a low plan [anecdotal] — https://community.fly.io/t/request-for-gdpr-data-processing-agreement-dpa/25461

**Portability.** Plain Dockerfile plus a small `fly.toml`.

**Deploys.** From GitHub via `flyctl deploy` in GitHub Actions.

**TLS and domains.** Automatic certificates and custom domains via `fly certs`.

**Security.** Firecracker micro-VM isolation, a managed proxy, no OS to patch, and secrets in `fly secrets` [judgement].

**Pros.**

- Effectively €0.
- Same city as Neon.
- Managed TLS.
- No OS patching.
- Runs the plain Docker image.

**Cons.**

- The €0 depends on a discretionary waiver with a $5 cliff, and needs a card on file.
- Getting the DPA takes a support email.
- Fly has changed its free offering before. The legacy free allowance was removed for new organizations [primary, "New organizations don't have a free tier"].

### 2. Northflank

**Price.**

- **Sandbox** is "Free", "No card needed", with "Up to $20/mo of resources on Northflank Cloud" and "Always on, no sleeping". Limits are 2 services, 2 jobs and 1 database [primary] — https://northflank.com/pricing
- Paid plans are pay as you go [primary, from `GET https://api.northflank.com/v1/plans`]:
  - `nf-compute-10` (0.1 vCPU, 256 MB): **$2.70/mo**
  - `nf-compute-20` (0.2 vCPU, 512 MB): **$5.40/mo**

**Regions.** `europe-west-frankfurt`, `europe-west-netherlands`, `europe-west-zurich` and `europe-west` [primary] — https://northflank.com/docs/v1/application/getting-started/create-a-project. A project's region is fixed once it's created [primary]. **Unverified:** whether a Sandbox project may choose an EU region.

**DPA.**

- Northflank Ltd (England and Wales) is the contracting entity [primary] — https://northflank.com/legal/terms
- I found no public DPA. The UK has an EU adequacy decision, so a UK processor isn't a blocker in itself [judgement].
- The pricing page lists SOC 2 Type II and ISO 27001 [primary].

**SSE and timeouts.** Not documented in what I found.

**Ops.** Managed TLS, custom domains, deploys from GitHub, and Docker or buildpacks [vendor-secondary].

**Pros.**

- €0 with no card and no sleep.
- Frankfurt region.
- Plain Docker.

**Cons.**

- Free region access, the DPA and the SSE behaviour are all unverified.
- Support is "best effort".
- A $20 free allowance is generous enough that it could change [judgement].

**To verify before choosing:**

- Create a Sandbox project and confirm that `europe-west-frankfurt` is selectable.
- Email legal@northflank.com for the DPA and sub-processor list.
- Test a 30-minute SSE stream.

### 3. Render

**Price.**

- Workspace plans:
  - Hobby: $0 plus compute.
  - Pro: $25 plus compute.
- Web services:
  - Free: 512 MB.
  - "Less than 1 CPU": **$7/mo** with 512 MB.
- Hobby includes 5 GB of bandwidth, then $0.15/GB, and 2 custom domains [primary] — https://render.com/pricing.md

**Does Free sleep?**

- Yes. Free web services spin down "after 15 minutes without inbound traffic", and spinning back up "takes about one minute". "Do not use them for production applications" [primary] — https://render.com/docs/free
- **Disqualified for SSE.**

**Regions.** Frankfurt is the only EU region. A service's region can't be changed after it's created [primary] — https://render.com/docs/regions

**Infrastructure.** Frankfurt runs on AWS `eu-central-1`, according to a Render status incident that mentions EBS volumes in `euc1-az3` [anecdotal/vendor-secondary] — https://status.render.com/incidents/hltvz1fsj3zx. That's the same AWS region as Neon.

**SSE.** Render articles state a 100-minute maximum request duration [vendor-secondary] — https://render.com/articles/real-time-ai-chat-websockets-infrastructure. Older forum posts report buffering through static-site rewrites [anecdotal]. Serve the SPA from the same Node service, not a separate Render static site, to avoid that.

**DPA.** A public DPA is available, with signing via trust.render.com [primary] — https://render.com/dpa. EU-US Data Privacy Framework certified [primary] — https://render.com/changelog/render-achieves-certification-under-the-eu-us-data-privacy-framework

**Ops.**

- Deploys on push to a linked branch.
- Supports Dockerfile or prebuilt images.
- Free managed TLS and custom domains, including wildcards.
- Zero-downtime deploys.

[primary] — https://render.com/docs/web-services

**Pros.**

- Fixed, predictable $7.
- Likely the lowest latency to Neon.
- The least to configure.

**Cons.**

- Costs about €7.3/mo including IVA [judgement].
- 5 GB of bandwidth on Hobby (ample for 20 users [judgement]).

### 4. Hetzner Cloud

**Price.**

- 2026 brought two price rises: on 1 April and on 15 June. The June one hit new orders and rescales [vendor-secondary] — https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ (that page returned 404 to my fetcher; the details come from search summaries).
- Current list prices, excluding VAT and with IPv4 included [primary] — https://www.hetzner.com/cloud/cost-optimized/ and https://www.hetzner.com/cloud/regular-performance/:
  - **Cost-optimized** CX23 (2 vCPU, 4 GB, 20 TB traffic) at **€5.99** and CAX11 (Arm) at **€6.49**. Both plan cards say "This product is currently unavailable." Third parties report the plans unorderable since September/October 2026 [anecdotal].
  - **Regular performance** CPX02 (1 vCPU, 1 GB, 20 GB NVMe, 20 TB) at **€6.49** in Falkenstein/Nuremberg or **€5.49** in Helsinki.
- With 21% IVA, that's ≈ €7.85 (DE) or €6.64 (HEL) [judgement].

**DPA.** You conclude it yourself in the account (accounts.hetzner.com/account/dpa); Hetzner doesn't sign custom DPAs [primary] — https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner. Hetzner is a German company, so no US parent.

**Ops for a solo developer** [judgement]. You own all of it:

- Ubuntu LTS with `unattended-upgrades`.
- The Hetzner Cloud Firewall, allowing 80/443 and SSH from your IP only, or SSH via Tailscale.
- Docker Compose with Caddy for automatic Let's Encrypt TLS.
- A GitHub Actions job that builds the image, pushes it to GHCR, then runs `ssh … docker compose pull && up -d`.
- Backups, monitoring, and rebooting after kernel updates.

Claude Code sessions can script all of this, but it's recurring work and a real way for security to fail.

**Latency.** Nuremberg/Falkenstein to Frankfurt should be low single-digit ms [judgement; Hetzner documents ≥120 Gbit/s links between Nuremberg, Falkenstein and Frankfurt — https://docs.hetzner.com/general/infrastructure-and-availability/data-centers-and-connection/]. Measure with a ping from the box before going live.

**Pros.**

- EU-owned.
- Self-serve DPA.
- No sleeping and no request limits.
- The most portable option: any Docker host.

**Cons.**

- Prices are rising and the cheap tiers are unavailable.
- Highest ops burden.
- Security depends on your own patching.

### 5. OVHcloud VPS

**Price.** VPS-1, with 2 vCores, 4 GB RAM, 40 GB NVMe and unlimited traffic at 500 Mb/s. **€3.81/mo excluding IVA, €4.61 including**, with a daily backup included [primary] — https://www.ovhcloud.com/es-es/vps/

**Unverified:**

- Whether that price needs a commitment term.
- Which EU datacentres are offered. OVH has French sites and a Frankfurt-area site [judgement].

**Other properties.**

- Same ops profile as Hetzner.
- French company with a GDPR DPA.

**Verdict.** The cheapest real EU VPS found. It's an alternative to Hetzner CPX02 if you take the VPS route, but check the term and the datacentre first.

### 6. Railway

**Price.**

- Free: $1/mo of credit, capped at 1 vCPU / 0.5 GB per service. That's not enough for always-on, since 0.5 GB costs about $5/mo.
- Trial: $5 one-time credit for 30 days, no card.
- Hobby: **$5/mo including $5 of usage**.
- Rates: RAM about $10/GB-month, CPU about $20/vCPU-month, egress $0.05/GB.

[primary] — https://railway.com/pricing

A 512 MB service idling at about 0.02 vCPU comes to roughly **$5.5/mo** [judgement].

**Region.** "EU West Metal", Amsterdam (`europe-west4-drams3a`), is the only EU region [primary] — https://docs.railway.com/reference/deployment-regions

**SSE.**

- "HTTP requests can run for up to 15 minutes if data keeps transferring", and are "closed after 5 minutes with no data transferred".
- Idle HTTP/1.1 keep-alive closes after 60 s.
- WebSockets are exempt from these limits.

[primary] — https://docs.railway.com/networking/public-networking/specs-and-limits

One user reports the edge killing requests that send no bytes for 60 s [anecdotal] — https://station.railway.com/questions/edge-kills-requests-with-no-response-byt-c65210de. A heartbeat handles all of this.

**DPA.** Public Data Processing Addendum [primary] — https://railway.com/legal/dpa

**Ops.** Deploys from GitHub, Dockerfile support, free automatic TLS and custom domains [primary] — https://docs.railway.com/reference/public-networking

**Verdict.** Works fine, but costs more than Fly for the same thing and is farther from Neon.

### 7. Scaleway Serverless Containers

**Price.**

- €0.000002 per GB-s and €0.00001 per vCPU-s.
- Free tier per month: 400,000 GB-s and 200,000 vCPU-s.
- Ingress and egress are free.

[primary, docs source] — https://github.com/scaleway/docs-content/blob/main/pages/serverless-containers/faq.mdx (the scaleway.com docs and pricing pages were bot-blocked).

The English pricing page reportedly shows a different memory rate from the French one [vendor-secondary], so confirm in the console's cost estimator.

**Always-on cost, min-scale 1** [judgement, calculated]:

- At 250 mvCPU / 512 MB: memory (1.314M − 0.4M) × €0.000002 = €1.83, plus CPU (657k − 200k) × €0.00001 = €4.57, for **≈ €6.40/mo**.
- At about 140 mvCPU / 256 MB: **≈ €2.20**. The CPU range is 70–6000 mvCPU and memory 128–12228 MB; check which pairings are allowed.

**Limits.**

- Requests last 10 s to **60 min**.
- Scale-to-zero after 15 min at min-scale 0.
- Concurrency is a soft target of 80 per instance, so set **max-scale 1** as well as min-scale 1.
- Images must be `linux/amd64`.

[primary] — https://github.com/scaleway/docs-content/blob/main/pages/serverless-containers/reference-content/containers-limitations.mdx

**Other properties.**

- EU-owned (France), with a DPA and sub-processor list [vendor-secondary] — https://www.scaleway.com/en/contracts/ and https://www.scaleway.com/en/subprocessorlist/
- Regions are Paris, Amsterdam and Warsaw [judgement; not confirmed on a page I could fetch].

**Verdict.** A credible EU-owned managed option at €2–7. The hourly SSE reconnect is harmless with `Last-Event-ID`. The pricing-page inconsistency is a small risk.

### 8. Cloudflare (Workers and Containers)

**Containers.**

- Requires Workers Paid (**$5/mo**), which includes 25 GiB-hours of memory, 375 vCPU-minutes and 200 GB-hours of disk.
- Beyond that: $0.0000025 per GiB-s, $0.00002 per vCPU-s (active CPU only) and $0.00000007 per GB-s of disk.
- Instance types start at **lite (1/16 vCPU, 256 MiB, 2 GB)** and **basic (1/4 vCPU, 1 GiB)**.

[primary] — https://developers.cloudflare.com/containers/pricing/

Always-on lite comes to ≈ $5 + $1.42 memory + $0.32 disk ≈ **$6.7/mo**. Basic comes to ≈ **$12/mo** [judgement, calculated]. A sixteenth of a vCPU is thin for Node [judgement].

**Placement.** `jurisdiction: "eu"` restricts containers to the EEUR/WEUR regions "for EU data residency" [primary] — https://developers.cloudflare.com/containers/platform-details/placement/ (an April 2026 feature).

**How requests reach it.** Requests go through a Worker, then a Durable Object, then the container. Instances stop on an inactivity timeout, `destroy()`, a rollout or a process exit. Cold starts take 1–3 s. The docs don't describe an always-on mode [primary] — https://developers.cloudflare.com/containers/platform-details/architecture/

**Workers alone.**

- No wall-clock limit while the client stays connected.
- Free plan: 10 ms CPU and 100,000 requests/day.
- 128 MB per isolate.

[primary] — https://developers.cloudflare.com/workers/platform/limits/

Isolates are stateless, so SSE fan-out would need Durable Objects, which means a rewrite that isn't Docker. Placement hints such as `aws:eu-central-1` are about latency only. The docs don't claim they guarantee EU execution [primary] — https://developers.cloudflare.com/workers/configuration/placement/

The TLS-terminating edge is global unless you use Cloudflare's Data Localization Suite, which I believe is Enterprise-only [judgement; verify].

**Verdict.** Dropped. It costs more than Fly for less, adds a Worker and Durable Object wrapper (lock-in), and has no documented always-on mode.

### 9. Oracle Cloud Always Free

**What's free.**

- Two `VM.Standard.E2.1.Micro` instances (1/8 OCPU, 1 GB).
- Ampere A1: 1,500 OCPU-hours and 9,000 GB-hours a month, "equivalent to 2 OCPUs and 12 GB".
- 200 GB of block storage.
- 10 TB/month of outbound traffic.

[primary] — https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

The A1 allowance was **halved in 2026**, from 4 OCPU / 24 GB. Reports put the enforcement date at 15 June or 18 August, and say over-limit instances get terminated [anecdotal] — https://www.linuxtoday.com/blog/oracle-quietly-cuts-free-tier-ampere-a1-resources-in-half/

**Reclamation.** Always Free instances "may be reclaimed" if, over 7 days:

- 95th-percentile CPU is under 20%;
- network use is under 20%;
- memory use is under 20% (A1 only).

[primary] Ping at 20 users will sit well under those thresholds. The docs don't say that upgrading to Pay As You Go exempts an instance from reclamation [primary, checked].

**Other limits.**

- Instances must be in your **home region**, which is chosen once.
- "Out of host capacity" errors are common [primary + anecdotal].
- A card is required at signup, according to widespread reports [anecdotal].

**Ops.** Same VPS burden as Hetzner, plus OCI security lists.

**Verdict.** Not recommended. €0, but reclamation, a free tier that's being cut, and capacity lottery make it the riskiest place for production PII. Workarounds that burn CPU to dodge reclamation break the spirit of the terms [judgement].

---

## Considered and dropped

- **Koyeb.**
  - The free instance (512 MB, 0.1 vCPU, Frankfurt or Washington) "scales down to zero when it doesn't receive any traffic for 1 hour", and that can't be disabled [vendor-secondary, from Koyeb docs via search] — https://www.koyeb.com/docs/run-and-scale/scale-to-zero
  - A card is required, with a $29 pre-authorization hold [primary] — https://www.koyeb.com/docs/faqs/pricing
  - Third parties say the card-free Starter tier closed after the Mistral AI acquisition, leaving Pro ($29/mo) as the entry point [anecdotal]. The nano instance (about $2.68/mo) could work, but plan availability is unclear.
- **Clever Cloud.** French PaaS with per-second billing and a GDPR fit. I couldn't get a current price from the official page, since it points to an estimator. The latest published figures (pico 256 MB at €4.50, nano 512 MB at €6.00) date from 2015–2023 [vendor-secondary] — https://clever.cloud/pricing/. Worth checking if you want an EU-owned managed PaaS, but no better than Scaleway on what I could verify.
- **DigitalOcean App Platform.**
  - $5/mo for 1 vCPU and 512 MiB, with 50 GiB of transfer. The free tier is static sites only [primary] — https://www.digitalocean.com/pricing/app-platform
  - The limits page (last updated 2022) says nothing about streaming timeouts, and an app's IP "may appear to be in a US region" [primary] — https://docs.digitalocean.com/products/app-platform/details/limits/
  - Fine, but it doesn't beat Fly on price or Render on clarity.
- **Scaleway Stardust and Instances.** STARDUST1-S is about €0.43/mo but IPv6-only without a paid IPv4, with prices revised from 1 June 2026 [vendor-secondary] — https://www.scaleway.com/en/blog/a-transparent-update-on-scaleway-pricing/. Too small, and it carries VPS ops anyway.

---

## Ranked recommendation

1. **Fly.io, `fra`, one 256–512 MB `shared-cpu-1x` Machine with autostop off.**
   - **Cost:** about €0 under the waiver, and about €4 if the waiver disappears.
   - **Portability:** plain Docker plus one small `fly.toml`.
   - **Security:** a managed VM with no OS to patch, and the same city as Neon.

   Get the DPA from support before real PII goes in. Set a billing alert and keep the image registry-agnostic, for example on GHCR.
2. **Northflank Sandbox in `europe-west-frankfurt`**, only if a free project can use that region and a DPA is available. It ties with Fly on cost and doesn't need a card, but has more unknowns.
3. **Render Starter, Frankfurt, $7/mo** (≈ €7.3 incl. IVA). This is the fallback if either free option changes, or if you'd rather pay for predictability.
   - Managed patching and TLS.
   - Likely on AWS `eu-central-1` next to Neon.
   - A public DPA.
   - A 100-minute stream cap, which heartbeat and reconnect cover.
4. **Hetzner CPX02 in Nuremberg or Falkenstein** (≈ €7.85 incl. IVA), **or OVHcloud VPS-1** (€4.61 incl. IVA, once the term and datacentre are confirmed). Choose this route if EU ownership becomes a requirement, or you want zero platform lock-in. Accept that patching, firewalling and Caddy/TLS become your recurring job, which is the main security risk for a solo maintainer.
5. Viable but not preferred:
   - **Scaleway Serverless Containers** (€2–6.40, EU-owned, 60-minute stream cap).
   - **Railway** (about $5.5, Amsterdam).
6. Not recommended:
   - **Oracle Always Free**, because of reclamation and policy cuts.
   - **Cloudflare Containers or Workers**, because of cost, the wrapper lock-in and no always-on guarantee.
   - **Render Free** and **Koyeb Free**, because they sleep.

**Why this order.** Cost is the top principle, and two managed hosts reach about €0 without sleeping. Portability holds for every option because the artefact is one Docker image, so the risk of a free policy changing costs about an hour of migration, not a rewrite. On security, a managed platform that patches the OS and terminates TLS beats a hand-run VPS for a solo maintainer. EU residency is met by pinning the region on every ranked option, with the same US-ownership caveat that Neon already carries.

**Open items to settle before deploying.**

- Get Fly's DPA from support. Confirm the waiver threshold is applied before VAT, and whether a Spanish business VAT ID changes that.
- Confirm that a Northflank Sandbox project can use an EU region, and get its DPA.
- Build SSE with a heartbeat every 20–30 s and `Last-Event-ID` resume, and pin the instance count to one, whichever host wins.
- Keep the health check off Neon, and decide in the realtime ticket whether fan-out uses Postgres `LISTEN`.
