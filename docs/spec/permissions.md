# Permissions

Permissions are enforced twice ([ADR 0002](../adr/0002-two-layer-permissions.md)):

1. **The server.** Every request is authorised by one thoroughly tested permissions module before it touches data.
2. **The database.** Postgres row-level security is a backstop, so even a buggy query can't return rows the Staff member may not see.

The front end only hides controls it knows will be refused. It is never trusted. A leaked Private channel is the worst failure Ping can have.

## Server layer: who can do what

Terms used below:

- **Can read a Channel** means the Channel is Public, or you're a member of it. This is the same for everyone, Admins included.
- **Member** means an active Channel member. **Channel admin** means an active Channel member with the Channel admin role. **Admin** means a company Admin.
- Deactivated and Invited Staff members can't sign in, so they can do nothing.
- In an **Archived channel**, only the actions marked ✱ are allowed. The rest are refused until it's unarchived.

### Staff members and Spark settings

| Action | Who |
| --- | --- |
| Invite, Resend, Cancel an invite | Admin |
| Change a Staff member's role | Admin (not the last active Admin demoting themself) |
| Change a Staff member's email | Admin |
| Deactivate, reactivate | Admin (not the last active Admin Deactivating themself) |
| Change own display name, own profile photo | Anyone, for themself |
| Remove someone's profile photo | Admin |
| Edit Attachment limits | Admin |
| See Invited Staff members | Admin |
| See active and Deactivated Staff members | Anyone |

### Channels

| Action | Who |
| --- | --- |
| Create a Channel | Anyone (becomes its Channel admin) |
| Find and read a Channel ✱ | Anyone who can read it |
| Edit name, description, "Who can resolve threads?" | Channel admin |
| Change visibility | Channel admin |
| Archive, unarchive ✱ (unarchive) | Channel admin; Admin on a Public channel or a Private channel they're a member of |
| Join | Anyone, Public channels only |
| Add members | Any member (Public); Channel admin (Private) |
| Remove members | Channel admin |
| Appoint or remove a Channel admin | Channel admin; Admin on a Public channel, for anyone including themself |
| Leave ✱ | Any member, except the last active Channel admin |
| Delete a Channel | Nobody |

### Threads, Thread Responses and Attachments

| Action | Who |
| --- | --- |
| Start a Thread | Member |
| Send a Thread Response, react | Member |
| Mention someone | Whoever is posting; only Staff members who can read the Thread can be Mentioned |
| Edit a Thread or Thread Response | Its author; Admin in a Channel they can read |
| Delete a Thread or Thread Response ✱ (Admin only) | Its author; Admin in a Channel they can read |
| Resolve, reopen | Any member, or only the author and Channel admins, per the Channel's setting |
| Upload an Attachment | Whoever is posting, within the Spark-wide limits |
| Download an Attachment ✱ | Anyone who can read the Thread |
| Remove an Attachment ✱ *(proposed for Archived)* | Its uploader; Channel admin of that Channel; Admin in a Channel they can read |
| Respond as a System thread's author | Nobody |

### Personal

| Action | Who |
| --- | --- |
| Acknowledge (mark read, Save) ✱ | Anyone who can read the Thread |
| Acknowledge by reacting or responding | Member (see above) |
| Remove a Thread from Saved ✱ | Its owner |
| Mute a Channel ✱ | Member |
| Mute a Thread ✱ | Anyone who can read it |
| Sections | Their owner only |
| Search | Anyone; results limited to what they can read |

### Refusals

- A Private channel the Staff member can't read, and everything in it, answers **404**, so its existence doesn't leak.
- Other refusals answer 403 with a message the UI can show (for example, why the last Channel admin can't leave).

Sources: [Who can do what in a Channel?](https://github.com/Patchalv/ping/issues/6), [What happens to a Deactivated Staff member's Channels and Threads?](https://github.com/Patchalv/ping/issues/5), [Are attachments in the MVP?](https://github.com/Patchalv/ping/issues/4), [How do the first Admins get in, and how do invite and reset emails arrive?](https://github.com/Patchalv/ping/issues/15#issuecomment-6863586131), and the decisions made while writing this spec.

## Database layer: row-level security

How the backstop works is recorded in [ADR 0004](../adr/0004-rls-roles-and-staff-member-table.md).

### Roles

- **`neondb_owner`** runs migrations, from GitHub Actions only. On Neon it belongs to `neon_superuser` and bypasses RLS, so the app never connects as it.
- **`ping_app`** is the app's request role. It connects through Neon's pooler, is created in SQL, and owns no tables.
- **`ping_system`** has its own small pool and is used only by one system-actions module, for:
  - **Ping fan-out:** creating or bumping other people's Pings for a new Thread, Thread Response or Mention, after the server has authorised the post;
  - Deactivation clean-up, automatic Channel admin promotion and automatic archiving;
  - the losing-access clean-up *(proposed; see [data-model.md](data-model.md#the-clean-up-routine))*;
  - invite acceptance and `bootstrap-admin` *(proposed)*;
  - the sweepers: file deletion, pending uploads, and `audit_event` retention *(proposed)*.

  Policies allow `ping_system` explicitly (`TO ping_system USING (true)`), so it needs no BYPASSRLS attribute. This list is wider than the one first written in ADR 0004; see its amendment.

### Identity per request

- Every request runs in one transaction that begins with `set_config('app.staff_id', <id>, true)`. The setting is local to the transaction, which is safe with PgBouncer's transaction mode. A plain `SET` is not.
- Policies return nothing when `app.staff_id` is unset, so a forgotten wrapper fails closed.
- No transaction ever stays open on a long-lived live-update stream.

### Policies

Every one of Ping's tables has RLS enabled and forced, with an explicit policy. The only tables without RLS are Better Auth's (`user`, `session`, `account`, `verification`).

| Table | `ping_app` policy |
| --- | --- |
| `channel`, `thread`, `thread_response`, `reaction`, `mention`, `attachment` (once attached) | **The visibility rule:** a row is visible when its Channel is Public or the current Staff member is a member of it. No Admin exception. Applied `FOR ALL`. |
| `channel_member` | The visibility rule, through the membership helper function (see [data-model.md](data-model.md#channels)). |
| `attachment` while pending | Its uploader only. |
| `ping` | Read and delete: the owner's own rows in Channels they can read. Insert and update: none (only `ping_system`, through the fan-out). |
| `saved_thread`, `mute` | Read, insert and delete: the owner's own rows in Channels they can read. Update: none. Clean-up of other people's rows is `ping_system`. |
| `section`, `section_channel` | Every command: the owner's own rows only. |
| `staff_member` | Read: every signed-in Staff member. Insert and update: an Admin only (the policy checks the current Staff member's `role`). Delete: an Admin, for an Invited person only. A Staff member can't write their own row, so they can't change their own role. |
| `staff_avatar` | Read: every signed-in Staff member. Insert, update and delete: the owner's own row. Delete: also an Admin. |
| `staff_invite` | Every command: Admins only. Accepting an invite runs as `ping_system`. |
| `spark_settings` | Read: everyone. Update: an Admin only. |
| `pending_file_deletion` | Insert only. Only `ping_system` reads, updates and deletes. |
| `audit_event` | Insert only. Nothing reads it through the app. |

Search runs through the same policies.

### Belt and braces

- `FORCE ROW LEVEL SECURITY` is added in raw SQL, because Drizzle doesn't emit it.
- CI fails if `ping_app` or `ping_system` can bypass RLS, owns a table, or if any table outside the Better Auth allowlist lacks forced RLS or a policy (see [testing.md](testing.md#rls-as-its-own-layer)).
- Neon doesn't document that `set_config(..., true)` works through its pooler. The first build slice proves it (see [testing.md](testing.md#what-the-first-build-slice-owes)).

Sources: [What is Ping's data model?](https://github.com/Patchalv/ping/issues/11#issuecomment-6861774289), and the [addendum on tables outside the visibility rule](https://github.com/Patchalv/ping/issues/16#issuecomment-6863848373).
