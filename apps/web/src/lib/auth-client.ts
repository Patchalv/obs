import { createAuthClient } from 'better-auth/react';

// Better Auth's own client, for its routes under /api/auth (sign-in, sign-out, the
// session). The one exception to "the typed hc client only": Better Auth's routes are
// not part of the Hono RPC AppType. Everything else goes through lib/api.ts.
export const authClient = createAuthClient({ basePath: '/api/auth' });
