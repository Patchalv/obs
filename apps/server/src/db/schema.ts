// Ping's tables, as Drizzle sees them. drizzle-kit generates the table DDL from this file.
// Roles, grants, row-level security and policies live in hand-written SQL migrations,
// because Drizzle doesn't emit FORCE ROW LEVEL SECURITY (ADR 0004).

import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// --- Better Auth tables. Owned by the auth module; no row-level security (data-model.md).

export const user = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// --- Ping's own tables. Every one has forced row-level security and explicit policies.

export const staffRole = pgEnum('staff_role', ['admin', 'member']);

export const staffMember = pgTable(
  'staff_member',
  {
    // Shares its key with Better Auth's user row.
    id: uuid('id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: staffRole('role').notNull().default('member'),
    createdAt: createdAt(),
    invitedBy: uuid('invited_by').references((): AnyPgColumn => staffMember.id),
    // Null while Invited.
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    deactivatedBy: uuid('deactivated_by').references((): AnyPgColumn => staffMember.id),
  },
  (t) => [
    check(
      'staff_member_deactivated_by_with_at',
      sql`(${t.deactivatedAt} is null) = (${t.deactivatedBy} is null)`,
    ),
  ],
);

/**
 * Security-relevant actions, kept for one year. Never holds message bodies or email
 * addresses. `actor_id` is null for system actions and failed sign-ins.
 */
export const auditEvent = pgTable(
  'audit_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    createdAt: createdAt(),
    actorId: uuid('actor_id').references(() => staffMember.id),
    kind: text('kind').notNull(),
    // No foreign key: the record outlives a cancelled invite's staff_member row.
    targetStaffId: uuid('target_staff_id'),
    ipAddress: text('ip_address'),
  },
  (t) => [index('audit_event_created_at_idx').on(t.createdAt)],
);
