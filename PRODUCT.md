# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Laptop first, but usable on a phone.

## Stack

Decided in `docs/adr/0001-portable-low-cost-eu-stack.md`: a Vite + React SPA served by one Hono Node app, with Neon Postgres, Better Auth and Drizzle, and Server-Sent Events for live updates. The repo is a pnpm TypeScript monorepo (`apps/web`, `apps/server`, `packages/shared`). Nothing has been built yet.

## Users

Ping's users are Spark's Staff members, about 20 people. Spark has two branches: an English academy and a School tours programme.

- **Primary users:** the owners and administrative staff. They are on laptops for most of the working day. They start Channels and Threads, follow the work, and clear their Pings and Saved list.
- **Secondary users:** teachers, maintenance and cleaning staff. They mostly receive Pings, read Threads and send Responses, often from a phone.

There are two company roles, Admin and Member (see `GLOSSARY.md`).

## Product Purpose

Ping replaces TECS Obs as Spark's internal tool for communication and work tracking. It covers Channels, Threads, Responses, Pings and Saved. It succeeds when staff stop using Obs, and when nothing that needs action gets lost: every Ping is Acknowledged, and anything someone needs to come back to is in their Saved list.

## Positioning

Ping is built only for Spark's staff, around one rule of attention: one Ping per Thread, with a count of new activity, that stays until the Staff member Acknowledges it by marking it read, reacting, Saving it or sending a Response. Viewing a Ping does not clear it. That makes Ping a work tracker as well as a chat, unlike a general chat app.

## Operating Context

- Staff use Ping during the working day at the academy and on the School tours programme.
- The main ritual is working down the Ping inbox and the personal Saved list.
- Threads can hold employee and child personal data.
- One person, Patrick, builds and maintains Ping, using Claude Code sessions.

## Capabilities and Constraints

- The domain language lives in `GLOSSARY.md` and is binding in the UI, code and docs. Use Thread, Response, Ping and Deactivated, never ticket, reply, notification or deleted.
- Ping takes nothing from TECS Obs: no data, no terminology and no design. `OBS_REVERSE_ENGINEERING.md` is background research only.
- The UI is English only.
- Sign-in is by email and password. Admins invite Staff members, and password reset is self-service.
- Pings are in-app only for the MVP. There are no email or push Pings.
- There are no direct messages. A 1:1 conversation is a Private channel with two members.
- Private means private, even to Admins. Permissions are enforced on the server and in the database, never in the front end (`docs/adr/0002-two-layer-permissions.md`).
- Attachments (images and files) are allowed on Threads and Responses.
- Data must stay in the EU. Running cost should be close to €0, with a hard cap of €50 a month.
- The full MVP spec is in `docs/spec/`.

## Brand Commitments

The product name is Ping. No Spark brand assets are binding. Ping is its own internal product.

## Evidence on Hand

None yet. There are no screenshots, real content or user feedback, and future work must not invent them. `prototypes/ping-screens/` exists but is empty.

## Product Principles

1. **Nothing gets lost.** Every piece of activity that needs a Staff member's attention reaches them as a Ping and stays until they act on it.
2. **Fast triage for the heavy user.** Clearing Pings and working through Saved on a laptop should take as few steps as possible.
3. **Readable and replyable on a phone.** Secondary users must be able to read a Thread and send a Response from a phone without effort.
4. **Privacy is structural.** Private channels and personal data are protected by the system itself, not by convention.
5. **Plain words.** Use the glossary terms consistently and avoid jargon from Obs or from general chat apps.
