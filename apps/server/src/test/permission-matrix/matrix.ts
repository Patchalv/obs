// The permission matrix: actor × Channel × action → allow or deny, run through the real
// Hono app in-process against the real database (docs/spec/testing.md).
//
// Every route outside the route-coverage allowlist needs rows here: at least one allow,
// plus a deny for every standard actor who shouldn't pass. Deny with 404 when the actor
// can't see the Channel, 403 when they can see it but can't act.
//
// Never change an existing expectation unless the issue says so; list any such change
// under **Permission changes** in the PR.
import type { Actor, ActorKind } from './actors';

export type ChannelKind = 'public' | 'private' | 'archived';

/** A route as Hono registers it, e.g. `POST /api/channels`. */
export type RouteKey = `${'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'} ${string}`;

export type RowContext = {
  actor: Actor;
  /** The row's Channel, created by the Channel fixtures. Undefined when `channel` is null. */
  channel: { id: string } | undefined;
};

export type MatrixRow = {
  route: RouteKey;
  /** What the actor tries to do, in GLOSSARY.md terms. */
  action: string;
  actor: ActorKind;
  /** The Channel the action targets, or null for routes with no Channel. */
  channel: ChannelKind | null;
  /** Builds the request. The harness adds the actor's cookie and the app's origin. */
  request(ctx: RowContext): { path: string; method?: string; body?: unknown };
  expect: { allow: true; status: number } | { allow: false; status: 403 | 404 | 401 };
};

/** The rows. The first arrive with "Exemplar: create a Channel and open it" (#31). */
export const MATRIX: MatrixRow[] = [];

/** Every route the matrix covers, for the route-coverage guard. */
export function coveredRoutes(rows: readonly MatrixRow[] = MATRIX): Set<RouteKey> {
  return new Set(rows.map((row) => row.route));
}
