# Ping MVP spec

This folder is the MVP spec for **Ping**, Spark's staff-only tool for Channels, Threads, Thread Responses, Pings and Saved. It gathers every decision made on the wayfinder map [Ping MVP: from idea to build plan](https://github.com/Patchalv/ping/issues/1), so the build can be planned from these files without reading the tickets. Each section links the ticket it came from, for anyone who wants the reasoning.

Use the terms in [`GLOSSARY.md`](../../GLOSSARY.md) everywhere: in code, issues, tests, UI copy and docs.

## Files

| File | Covers |
| --- | --- |
| [product.md](product.md) | What Ping does: Staff members and roles, sign-in and invites, Channels, Threads, Thread Responses, reactions, Mentions, Pings, Acknowledge, Saved, Mute, Resolve, Archive, Attachments, Deactivation, search and live updates. |
| [screens.md](screens.md) | Layout and flows on laptop and phone. |
| [data-model.md](data-model.md) | Tables, constraints, indexes and the clean-up rules. |
| [permissions.md](permissions.md) | Who can do what (the server layer), and how Postgres row-level security backs it up (the database layer). |
| [platform.md](platform.md) | Stack, domains, email, environments, deploys, secrets, backups, monitoring, baseline security, cost and GDPR. |
| [testing.md](testing.md) | Testing strategy, the rules every build slice follows, and what the foundation slices owe. |
| [go-live.md](go-live.md) | The checklist that must be complete before real Spark data goes in. |

## Governing principles

Every decision was weighed against these three, and new ones should be too:

1. **Minimal cost.** Ping is a side project. Aim for close to €0 a month, with a hard cap of €50.
2. **Portability first.** Use plain, open pieces that are easy to move away from if pricing or problems change.
3. **Security.** Threads carry employee and child personal data. Data stays in the EU, and permissions are enforced on the server and in the database, never in the front end.

## Standing constraints

- Patrick builds and maintains Ping alone, through Claude Code sessions. He owns every account during the proof of concept.
- Laptop first, but usable on a phone. English only.
- Sign-in is by email and password. Admins invite Staff members; password reset is self-service.
- Pings are in-app only. There is no email or push delivery of Pings.
- There are no direct messages. A 1:1 conversation is a Private channel with two members.
- Private means private, even to Admins.

## Out of scope for the MVP

- Typing indicators and online presence.
- Google Workspace sign-in.
- A Spanish interface.
- Email or push delivery of Pings.
- Showing who acknowledged a Thread ("read by").
- Acknowledging many Pings at once ("mark all read").
- Profile photos. Ping shows coloured initials.
- A Channel's Files tab.
- Attachment limits that Admins can edit. They're fixed in code.
- Making a Private channel Public.
- Multi-factor sign-in.
- Anything customer-facing (families, schools, students).
- Announcement-only Channels (a "who can start Threads" setting).
- Search by date range, links, files or people; typo-tolerant search.
- Virus scanning of Attachments.
- An edit history for Threads and Thread Responses.
- Handing accounts and infrastructure over to Spark.
- Everything else TECS Obs does, and any data migration from or integration with it. [`OBS_REVERSE_ENGINEERING.md`](../../OBS_REVERSE_ENGINEERING.md) is background research only; Ping shares no data, terminology or design with Obs.

## Architecture decisions

- [ADR 0001](../adr/0001-portable-low-cost-eu-stack.md): a portable, near-zero-cost EU stack.
- [ADR 0002](../adr/0002-two-layer-permissions.md): permissions enforced in the server, then by row-level security.
- [ADR 0003](../adr/0003-rich-text-stored-as-prosemirror-json.md): rich text stored as ProseMirror JSON.
- [ADR 0004](../adr/0004-rls-roles-and-staff-member-table.md): RLS roles, per-transaction identity and the `staff_member` table.

## Decisions settled while writing the spec

These were raised with Patrick while this spec was being written ([Write Ping's MVP spec in docs/spec/](https://github.com/Patchalv/ping/issues/17)):

- **Attachment removal.** The uploader, company Admins and Channel admins can remove an Attachment. This is the one moderation power Channel admins have, so that wrongly shared personal data can come down fast.
- **Archived channels** are read-only for content, but personal actions still work. See [Archive](product.md#archive).
- **To Do is renamed Saved.** It's a personal list of Threads to come back to: to read later, to respond to, or to act on. Saving a Thread Acknowledges its Ping, as marking it To Do did.
- **Non-members of a Public channel** can read and Acknowledge, but must join before they start a Thread, send a Thread Response or react.
- **Profiles.** Every Staff member can change their own display name. (Profile photos and Admin email changes were dropped in the plan review, below.)
- **Ping fan-out needs more than `ping_app`.** `ping_app` can only touch a Staff member's own Ping, Saved and mute rows, so creating and bumping other people's Pings runs through the system-actions module after the server has authorised the post. First recorded as running under `ping_system`; the plan review moved it to a system function (below).
- **`docs/testing.md`** is written by the foundation slice [Database, RLS backbone and sign-in](https://github.com/Patchalv/ping/issues/29), once test commands exist. The strategy it will hold is in [testing.md](testing.md).

## Confirmed assumptions

These are implementation-level choices the tickets didn't make. The spec proposed an answer for each, and Patrick confirmed them all before the build plan was sliced ([Slice the MVP spec into a vertical-slice build plan](https://github.com/Patchalv/ping/issues/18)).

- **Table names** for Sections (`section`, `section_channel`) and invites (`staff_invite`), and the columns marking the Invited state on `staff_member`.
- **Invite acceptance and `bootstrap-admin`** run as `ping_system` through the system-actions module, because no Staff member is signed in when they run.
- **The losing-access clean-up** (leaving, removal, a Channel turning Private) can't run as plain `ping_app`, because it deletes other people's Ping, Saved and mute rows. It is now a system function (below).
- **`audit_event` retention** is enforced by a third sweeper that deletes rows older than one year.
- **Reacting acknowledges.** A reaction on the Thread or on any of its Thread Responses Acknowledges your Ping on that Thread. The 👍 button on a Thread row reacts to the Thread itself.
- **Archived channels.** Attachment removal (by the uploader, a Channel admin or an Admin) still works in an Archived channel, alongside Admin deletes, so personal data can always be taken down.
- **Live updates** also carry edits, deletions, membership changes and Channel changes, so open screens stay correct.
- **Sessions** use Better Auth's default lifetime (7 days, refreshed while in use).
- **Times** are shown in the viewer's browser time zone.
- **Pings and Saved lists** are ordered newest first: Pings by their latest activity, Saved by when the Thread was saved.

## Changes from the plan review

A review of this spec on 2026-11-14, before any code was written, found gaps and Patrick settled each one. The files above already carry the results.

**Security and privacy**

- **System functions.** Ping fan-out, the losing-access clean-up, the Deactivation clean-up and Channel creation are `SECURITY DEFINER` functions called inside the request's transaction. Before, they ran as `ping_system` on a second connection, which can't share a transaction with the post, so a failed fan-out would have lost Pings. `ping_system` now does only work with no signed-in Staff member. See [permissions.md](permissions.md#system-functions) and the second amendment to [ADR 0004](../adr/0004-rls-roles-and-staff-member-table.md).
- **Admins can't change anyone's email.** An Admin could have changed an email, reset the password and signed in as that person. Each Staff member changes their own email, confirmed through the new address.
- **A Private channel can never be made Public.** Public to Private stays.
- **The server strips image metadata.** The browser still resizes, but the server no longer trusts it. HEIC is no longer accepted.
- **Passwords** are at least 12 characters and checked against known breaches. No multi-factor sign-in in the MVP.
- **Live-update events carry IDs only.** The browser refetches through the permission-checked API.
- **The restore test keeps a decrypt key in Fly secrets.** The spec used to say the private key was offline only.

**Scope**

- **Dropped from the MVP:** profile photos, Admin-editable Attachment limits (now fixed at 20 MB and 5 files) and the Files tab. This removes the `staff_avatar` and `spark_settings` tables and the Admin Settings screen.
- **Kept as they were:** Pings in-app only, no "mark all read", and Section drag and drop.
- **Added to [screens.md](screens.md#baseline-behaviours):** paging, drafts, supported browsers and an accessibility floor.

**Cost**

- **Fly prod runs in 256 MB,** not 512 MB, to stay under the $5 waiver. See [platform.md](platform.md#cost) and the amendment to [ADR 0001](../adr/0001-portable-low-cost-eu-stack.md).
- **Neon moves to the Launch plan at go-live,** paid by Spark. The free plan covers the proof of concept.

**Process**

- **Staff see the prototype before Phase 3.** Patrick shows prototype B2 to Doug, Inge and one teacher, and asks about three things Ping leaves out: assigning a Thread to someone or giving it a due date, seeing who has read a Thread, and Pings reaching a phone when Ping isn't open. Phases 1 and 2 don't wait for this.
- **A pilot follows Phase 4,** with its own short list in [go-live.md](go-live.md#before-the-pilot).
- **[go-live.md](go-live.md) gained** the GDPR paperwork items, the Neon plan change and the Obs cutover plan.
