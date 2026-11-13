# How row-level security is enforced: per-transaction identity, an app role and a system role, and no auth admin plugin

**Status:** accepted

ADR 0002 makes Postgres row-level security a backstop behind the server's permission checks. This ADR records how that backstop actually works on Neon, and one auth choice made to protect it.

## Decision

- **One visibility rule for everyone.** A row in a channel-scoped table is visible when its Channel is Public or the current Staff member is a member of it. Admins get no exception: "Private means private, even to Admins." Every child row carries a copy of `channel_id`, so each policy is a single lookup. Ping, Saved and mute rows also restrict reads to their owner.
- **Migrations** run as `neondb_owner`. On Neon that role belongs to `neon_superuser` and bypasses RLS, so the app never connects as it.
- **The app** connects through Neon's pooler as `ping_app`, a role created in SQL that owns no tables.
- **Identity per request.** Every request runs in one transaction that begins with `set_config('app.staff_id', <id>, true)`. That setting is local to the transaction, which is safe with PgBouncer's transaction mode. A plain `SET` is not safe there, because a session setting could leak into another person's request on a shared connection. Policies return nothing when `app.staff_id` is unset, so a forgotten wrapper fails closed.
- **System actions** use a separate `ping_system` role with its own small pool:
  - deactivation clean-up, automatic Channel admin promotion and automatic archiving;
  - the sweeper that deletes Attachment files;
  - the sweeper that removes uploads never posted.

  Policies allow `ping_system` explicitly, so it needs no BYPASSRLS attribute. Only one system-actions module may use it.
- **Belt and braces:**
  - `FORCE ROW LEVEL SECURITY` is added in raw SQL, because Drizzle doesn't emit it.
  - A test fails if `ping_app` can bypass RLS.
- **Staff member is its own table.** `staff_member` shares its primary key with Better Auth's `user` table and holds Ping's role and Deactivated state. Better Auth's **admin plugin is not used**: its impersonation and set-password features would let a company Admin sign in as someone else and read their Private channels. Deactivation is done by a session hook that refuses sign-in, plus deleting the person's sessions.

## Considered options

- **Session-level `SET` on a direct connection:** rejected. One missed reset leaks one person's identity into the next request.
- **A Postgres role per Staff member** (`SET ROLE`): rejected. Roles would have to be kept in sync with Staff members.
- **Neon's own RLS (`pg_session_jwt`, `auth.user_id()`):** rejected. It is Neon-specific, which goes against ADR 0001's portability, and it is built for browsers querying the database directly.
- **An `app.system` flag set through `set_config`:** rejected, because any code path could set it.
- **`SECURITY DEFINER` functions for system actions:** not chosen for now. They avoid a second credential but move logic into plpgsql. They stay the fallback if `ping_system` proves awkward.
- **Better Auth's admin plugin with impersonation locked down by access control:** rejected. It is a liability we would have to keep closed. Extending `user` directly was also rejected, so that changing auth library touches only the auth tables.

## Consequences

- Two database credentials to store and rotate.
- No transaction may stay open on a long-lived SSE stream.
- Neon doesn't document that `set_config(..., true)` works through its pooler. The foundation slice [Staging and prod deploy pipeline](https://github.com/Patchalv/ping/issues/30) must prove it with a test.
- Tests must exercise both permission layers, as ADR 0002 already requires.

## Amendment (2026-11-13): what `ping_system` does

Writing the MVP spec showed that owner-only rows for Pings, Saved Threads and mutes mean `ping_app` can't touch anyone else's. Several ordinary actions need to, so `ping_system`'s job is wider than the list above:

- **Ping fan-out.** Posting a Thread, Thread Response or Mention reads other people's mutes and Saved Threads and creates or bumps their Pings. The server authorises the post as `ping_app`, then the system-actions module does the fan-out as `ping_system`.
- **The losing-access clean-up** when someone leaves or is removed from a Channel, or a Channel turns Private, because it deletes other people's Ping, Saved and mute rows.
- **Invite acceptance and `bootstrap-admin`,** because nobody is signed in when they run.
- **The `audit_event` retention sweeper.**

The rule that only one system-actions module may use `ping_system` still holds. `SECURITY DEFINER` functions remain the fallback. The full policy table is in `docs/spec/permissions.md`.
