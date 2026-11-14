---
paths:
  - "apps/server/src/features/**"
---

# Touching a server route

The rules are in `docs/spec/permissions.md` and ADR 0002. Every route you add or change needs:

- **Validation:** `@hono/zod-validator` on params, query and body, with the schema in `packages/shared`. Read input only through `c.req.valid(...)`.
- **A permission call:** a `require…` helper from `apps/server/src/permissions/` before any work. Don't put permission logic in the route.
- **`withStaffTx()`** around every query, and `await` every query (ESLint's `no-floating-promises` checks this). An unawaited query can escape the `app.staff_id` transaction.
- **Errors are thrown, never returned:** `NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`. Don't set error statuses by hand.
- **404 vs 403:** deny with 404 when the actor can't see the Channel (a Private channel they aren't in, Admins included). Deny with 403 when they can see it but can't do the action.
- **Permission-matrix rows:** at least one allow, plus a deny for every standard actor who shouldn't pass. Deny rows assert the status and that the database is unchanged.
- **Chained routes** so Hono RPC still infers `AppType` for `apps/web`.

Never change an existing matrix expectation or the route-coverage allowlist unless the issue says so. List any such change under **Permission changes** in the PR.
