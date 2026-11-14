// Better Auth: email and password only, public sign-up off, no admin plugin (ADR 0004).
// Better Auth reaches its own four tables through the database's auth handle. Everything
// that touches Ping's tables goes through withStaffTx() or withAnonymousTx().
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { haveIBeenPwned } from 'better-auth/plugins';
import { eq, sql } from 'drizzle-orm';
import type { ServerConfig } from '../config';
import { type Database, schema } from '../db';
import { CLIENT_IP_HEADERS, clientIp } from './client-ip';

const SEVEN_DAYS = 60 * 60 * 24 * 7;

const DEACTIVATED_CODE = 'STAFF_MEMBER_DEACTIVATED';

export function createAuth(database: Database, config: ServerConfig['auth']) {
  return betterAuth({
    appName: 'Ping',
    baseURL: config.baseUrl,
    basePath: '/api/auth',
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(database.authDb, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    session: { expiresIn: SEVEN_DAYS },
    // Better Auth turns it off outside production by default; Ping wants it everywhere.
    rateLimit: { enabled: true, storage: 'memory' },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: true,
      defaultCookieAttributes: { sameSite: 'lax', secure: true, httpOnly: true },
      ipAddress: { ipAddressHeaders: CLIENT_IP_HEADERS },
    },
    telemetry: { enabled: false },
    // The breached-password check runs on password set and change. Sign-in never calls it.
    plugins: [haveIBeenPwned()],
    databaseHooks: {
      session: {
        create: {
          // Refuses sign-in to Deactivated Staff members, and to a user with no
          // staff_member row. Runs after the password has been checked, as that Staff
          // member, so the read goes through the staff_member policy.
          before: async (session) => {
            const rows = await database.withStaffTx(session.userId, (tx) =>
              tx
                .select({ deactivatedAt: schema.staffMember.deactivatedAt })
                .from(schema.staffMember)
                .where(eq(schema.staffMember.id, session.userId)),
            );
            const staff = rows[0];
            if (!staff || staff.deactivatedAt) {
              throw new APIError('FORBIDDEN', {
                code: DEACTIVATED_CODE,
                message: 'You’ve been Deactivated in Ping. Ask a Ping Admin.',
              });
            }
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email') return;
        const ip = clientIp(ctx.request?.headers ?? ctx.headers);
        const newSession = ctx.context.newSession;

        if (newSession && !isAPIError(ctx.context.returned)) {
          const staffId = newSession.user.id;
          await database.withStaffTx(staffId, (tx) =>
            tx.insert(schema.auditEvent).values({
              actorId: staffId,
              kind: 'sign_in_succeeded',
              targetStaffId: staffId,
              ipAddress: ip,
            }),
          );
          return;
        }

        // Failed: record the matched Staff member's ID when there is one. Never the email.
        const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
        const matched = email
          ? await database.authDb
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(sql`lower(${schema.user.email}) = lower(${email})`)
          : [];
        await database.withAnonymousTx((tx) =>
          tx.insert(schema.auditEvent).values({
            kind: 'sign_in_failed',
            targetStaffId: matched[0]?.id ?? null,
            ipAddress: ip,
          }),
        );
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
