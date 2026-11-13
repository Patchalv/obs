# Data model

A sketch of Ping's Postgres schema, not code. Drizzle defines it with SQL migrations. Row-level security and the database roles are in [permissions.md](permissions.md#database-layer-row-level-security).

Source: [What is Ping's data model?](https://github.com/Patchalv/ping/issues/11#issuecomment-6861774289), plus the Sections table from [the screens ticket](https://github.com/Patchalv/ping/issues/8#issuecomment-6862576413), `audit_event` from [the deploy ticket](https://github.com/Patchalv/ping/issues/12#issuecomment-6862919205), and the invite flow from [the first-Admins ticket](https://github.com/Patchalv/ping/issues/15#issuecomment-6863586131). Tables marked *(proposed)* were named while writing this spec; see [Assumptions to confirm](README.md#assumptions-to-confirm).

## Conventions

- **IDs** are UUIDs everywhere. Better Auth runs with `generateId: "uuid"`; Ping's tables default to `gen_random_uuid()`.
- **State is a timestamp plus an actor**, not a boolean: `archived_at/by`, `resolved_at/by`, `deactivated_at/by`, `edited_at/by`, `deleted_at/by`, `removed_at/by`.
- **No edit history.** Only the latest text is kept, plus who last edited it and when. System threads record Channel changes in public, and `audit_event` records security-relevant actions.
- **`channel_id` is copied onto every child row,** so each RLS check is a single lookup. A composite foreign key `(thread_id, channel_id)` → `thread(id, channel_id)` stops the copy drifting. Threads never move between Channels.
- **Exactly-one-target rows.** Reactions, Mentions and Attachments each live in one table with nullable `thread_id` and `thread_response_id` and a check constraint, keeping real foreign keys and cascades.
- **Spark-wide settings** live in a single-row typed table with check constraints.
- **No live-update event table.** The server keeps an in-memory buffer, and a client that falls behind refetches.
- **Rich-text bodies** are ProseMirror JSON in a `jsonb` `body` column, with plain text extracted by the server into `body_text` on every save, for search and snippets ([ADR 0003](../adr/0003-rich-text-stored-as-prosemirror-json.md)).

## Auth and Staff members

**Better Auth tables** (`user`, `session`, `account`, `verification`)

- Owned by the auth module. The display name and email live only on `user`.
- Better Auth's admin plugin is **not** used: its impersonation and set-password features would let an Admin read someone else's Private channels ([ADR 0004](../adr/0004-rls-roles-and-staff-member-table.md)).
- Public sign-up is disabled.

**`staff_member`**

- `id`: primary key, and a foreign key to `user.id`, so the key is shared.
- `role`: `admin` or `member`.
- `created_at`.
- `invited_by` → `staff_member` *(proposed)*.
- `joined_at` *(proposed)*: null while Invited, set when the invite is accepted.
- `deactivated_at`, `deactivated_by` → `staff_member`.
- Every person foreign key in Ping's own tables points here.
- Created together with `user` in one transaction, by an invite.
- A Better Auth session hook refuses sign-in to Deactivated Staff members. Deactivating deletes their sessions in the same transaction.

**`staff_invite`** *(proposed)*

- `staff_id` (primary key) → `staff_member`, `token_hash`, `expires_at` (7 days), `created_by`, `created_at`, `email_failed_at`.
- One live token per Invited person. Resend replaces the row; accepting deletes it. Cancelling deletes the `user`, `staff_member` and `staff_invite` rows.

**`staff_avatar`** *(proposed)*

- `staff_id` (primary key) → `staff_member`, `object_key` (random UUID, unique), `updated_at`.
- One row per Staff member with a profile photo. It's a separate table so a Staff member can change their own photo without having any write access to their `staff_member` row, which holds their role.

Password-reset tokens use Better Auth's own `verification` table.

## Spark settings

**`spark_settings`** (exactly one row)

- `max_file_size_bytes`: default 20 MB, check ≤ 50 MB.
- `max_files_per_post`: default 5, check ≤ 20.
- `updated_at`, `updated_by`.

## Channels

**`channel`**

- `id`, `name`, `description`.
- `visibility`: `public` or `private`.
- `resolve_policy`: `any_member` (default) or `author_and_channel_admins`.
- `created_at`, `created_by`, `archived_at`, `archived_by`.
- Search: a generated `search` tsvector (English) over name and description, with a GIN index.

**`channel_member`**

- `channel_id`, `staff_id`, `is_channel_admin`, `joined_at`.
- Primary key `(channel_id, staff_id)`, with an index on `staff_id`.
- Its own visibility policy can't query `channel_member` directly, or Postgres raises "infinite recursion detected in policy". Membership checks go through a small helper function owned by the table owner (for example `is_channel_member(channel_id)`), which every policy uses.
- Leaving or being removed deletes the row. Rejoining sets a new `joined_at`.
- Auto-promotion on Deactivation picks the active member with the earliest `joined_at`; a tie goes to the Staff member created first.

## Sidebar Sections

**`section`** *(proposed name)*

- `id`, `staff_id`, `name`, `position`, `collapsed`, `created_at`.

**`section_channel`** *(proposed name)*

- `staff_id`, `channel_id`, `section_id` → `section`, `position`.
- Primary key `(staff_id, channel_id)`.
- A Channel with no row is in the default Channels section.
- Leaving a Channel, or losing access to it, deletes its row. Deleting a Section moves its Channels back to the default section.

Both tables are visible only to their owner.

## Threads and Thread Responses

**`thread`**

- Identity and author: `id`, `channel_id`, `author_id` (null for System threads), `is_system`.
- System threads: `system_kind`, `system_payload` (`jsonb` of Staff member IDs, rendered at view time so names stay current).
- Content: `title`, `body` (`jsonb`), `body_text`.
- State: `created_at`, `latest_activity_at`, `edited_at/by`, `resolved_at/by`.
- `unique (id, channel_id)`, for the composite foreign keys.
- Check: a System thread has no author and has a kind and payload; an ordinary Thread is the other way round.
- `latest_activity_at` only moves forward. It starts at `created_at`, and each new Thread Response sets it to that Thread Response's `created_at`. Deleting a Thread Response doesn't move it back.
- Search: a generated `search` tsvector over `title` and `body_text`, with a GIN index.
- Indexes: `(channel_id, latest_activity_at)` and `(channel_id, created_at)`.
- Deleting a Thread is a real delete that cascades to its Thread Responses, reactions, Mentions, Attachments, Pings and Saved entries. Its file objects go through `pending_file_deletion`.

**`thread_response`**

- `id`, `thread_id`, `channel_id` (composite foreign key), `author_id`, `body` (`jsonb`), `body_text`, `created_at`, `edited_at/by`, `deleted_at/by`.
- Deleting a Thread Response keeps the row as the "Thread Response deleted" placeholder: its body is nulled (check: deleted ⇒ body is null), and its Attachments, reactions and Mentions are removed.
- Search: a generated `search` tsvector over `body_text`, with a GIN index. Search excludes deleted Thread Responses.
- Index: `(thread_id, created_at)`.

## On Threads and Thread Responses

**`reaction`**

- `channel_id`, `thread_id` or `thread_response_id`, `staff_id`, `emoji` (text), `created_at`.
- Partial unique indexes on (target, `staff_id`, `emoji`).

**`mention`**

- `channel_id`, `thread_id` or `thread_response_id`, `staff_id`.
- Rebuilt from the Mention nodes on every save. Comparing the new rows with the old ones shows who was newly Mentioned in an edit, and only they get a Ping.

**`attachment`**

- `id`, `channel_id`, `thread_id` or `thread_response_id`, `uploader_id`, `object_key` (random UUID, unique), `original_filename`, `content_type`, `size_bytes`, `created_at`, `removed_at/by`.
- **Pending:** a file uploaded while its post is being written has no target and no `channel_id`, and only its uploader can see it. It becomes attached when the post is saved.
- Check: at most one target, and none only while pending.
- Pending Attachments older than 24 hours are swept with their files.
- Removal deletes the file for real and keeps the row as the "Attachment removed by <name>" placeholder.
- Original filenames live only here; object keys in storage are random.

## Attention

Ping, Saved and mute rows belong to one Staff member, and `ping_app` can only touch the current Staff member's own rows. Creating or bumping other people's Pings when someone posts (the fan-out) therefore runs as `ping_system`, after the server has authorised the post. See [permissions.md](permissions.md#roles).

**`ping`**

- `staff_id`, `thread_id`, `channel_id`, `count`, `first_at`, `last_at`.
- Primary key `(staff_id, thread_id)`, with an index on `(staff_id, last_at)`.
- A row exists only while the Ping is open. New activity upserts it (raising `count` and `last_at`) through the fan-out; Acknowledging deletes it. "With Pings" is an `EXISTS` check.

**`saved_thread`**

- `staff_id`, `thread_id`, `channel_id`, `saved_at`.
- Primary key `(staff_id, thread_id)`, with an index on `(staff_id, saved_at)`.
- Removing a Thread from Saved deletes the row.

**`mute`**

- `staff_id`, `channel_id`, `thread_id` (null means the whole Channel).
- Unique on `(staff_id, channel_id, thread_id)` with `NULLS NOT DISTINCT`.
- Muting a Channel requires membership. Muting a Thread requires only being able to read it.

## Housekeeping

**`pending_file_deletion`**

- `object_key`, `requested_at`, `attempts`, `last_error`.
- Written in the same transaction as any Thread delete, Thread Response delete, Attachment removal, profile photo replacement or removal, and pending-upload sweep. An in-app sweeper deletes the storage objects and retries until they're gone, because a database transaction can't include object storage.

**`audit_event`**

- `id`, `created_at`, `actor_id` (null for system actions and failed sign-ins), `kind`, `target` columns or a `jsonb` payload of IDs.
- Never holds message bodies or email addresses. A failed sign-in records the matched Staff member's ID when there is one, and the request IP.
- Kept for one year; a sweeper deletes older rows *(proposed)*.

## The clean-up routine

One routine handles every way someone loses access. It deletes other people's Ping, Saved and mute rows, which `ping_app` can't touch, so it runs as `ping_system` through the system-actions module *(proposed)*:

| Case | Pings | Saved | Mutes | Section placement |
| --- | --- | --- | --- | --- |
| Leaves a Public channel | kept | kept | dropped | dropped |
| Leaves, or is removed from, a Private channel | dropped | dropped | dropped | dropped |
| Channel turns Private (every non-member) | dropped | dropped | dropped | n/a |
| Deactivated (all Channels) | dropped | dropped | dropped | dropped |

The Channel-turns-Private case runs in the same transaction as the visibility change. Deactivation also deletes the person's sessions, promotes a replacement sole Channel admin where needed, and archives any Channel left with no active members.
