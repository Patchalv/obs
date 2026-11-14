// The route-coverage guard: every registered Hono route needs a permission-matrix entry,
// except the short allowlist below (docs/spec/testing.md).
//
// Changing the allowlist weakens the guard: list it under **Permission changes** in the PR.

/** Routes with no matrix entry, by design. */
const ROUTE_ALLOWLIST: readonly string[] = [
  // Uptime checks. Never touches the database.
  'GET /healthz',
  // Better Auth's routes, including sign-in, sign-out, get-session and password reset.
  'GET /api/auth/*',
  'POST /api/auth/*',
  // Invite accept arrives with "Invites, bootstrap-admin and email" (#32), and any
  // password-reset route outside Better Auth with "Password reset" (#33). Their slices
  // add them here.
];

type RegisteredRoute = { method: string; path: string };

/**
 * Registered routes that are neither covered by the matrix nor allowlisted. Entries with
 * method ALL come from `app.use` middleware, which is not a route of its own.
 */
export function uncoveredRoutes(
  routes: readonly RegisteredRoute[],
  covered: ReadonlySet<string>,
  allowlist: readonly string[] = ROUTE_ALLOWLIST,
): string[] {
  const keys = routes
    .filter((route) => route.method !== 'ALL')
    .map((route) => `${route.method} ${route.path}`);
  return [...new Set(keys)].filter((key) => !covered.has(key) && !allowlist.includes(key));
}
