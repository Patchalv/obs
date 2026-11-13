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
| [testing.md](testing.md) | Testing strategy, the rules every build slice follows, and what the first build slice owes. |
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
- **Profiles.** Every Staff member can change their own display name and upload their own profile photo. Only Admins change someone's email.
- **Ping fan-out runs as `ping_system`.** `ping_app` can only touch a Staff member's own Ping, Saved and mute rows, so creating and bumping other people's Pings runs through the system-actions module after the server has authorised the post. Recorded as an amendment to [ADR 0004](../adr/0004-rls-roles-and-staff-member-table.md).
- **`docs/testing.md`** is written by the first build slice, once test commands exist. The strategy it will hold is in [testing.md](testing.md).

## Assumptions to confirm

These are implementation-level choices the tickets didn't make. The spec proposes an answer for each so the build can go ahead. Change any of them before the build plan is sliced if they're wrong.

- **Table names** for Sections (`section`, `section_channel`), invites (`staff_invite`) and profile photos (`staff_avatar`), and the columns marking the Invited state on `staff_member`.
- **Profile photos live in their own table** (`staff_avatar`), so no Staff member ever needs write access to their own `staff_member` row, which holds their role.
- **Invite acceptance and `bootstrap-admin`** run as `ping_system` through the system-actions module, because no Staff member is signed in when they run.
- **The losing-access clean-up** (leaving, removal, a Channel turning Private) runs as `ping_system` too, because it deletes other people's Ping, Saved and mute rows.
- **`audit_event` retention** is enforced by a third sweeper that deletes rows older than one year.
- **Reacting acknowledges.** A reaction on the Thread or on any of its Thread Responses Acknowledges your Ping on that Thread. The 👍 button on a Thread row reacts to the Thread itself.
- **Profile photos** are processed like image Attachments (resized to 512 px, metadata stripped), stored in the Attachments bucket, served through the server to any signed-in Staff member, and removable by their owner or an Admin.
- **Archived channels.** Attachment removal (by the uploader, a Channel admin or an Admin) still works in an Archived channel, alongside Admin deletes, so personal data can always be taken down.
- **Live updates** also carry edits, deletions, membership changes and Channel changes, so open screens stay correct.
- **Sessions** use Better Auth's default lifetime (7 days, refreshed while in use).
- **Times** are shown in the viewer's browser time zone.
- **Pings and Saved lists** are ordered newest first: Pings by their latest activity, Saved by when the Thread was saved.
