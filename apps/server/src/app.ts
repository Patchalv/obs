import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { HealthzResponse } from '@ping/shared';
import { Hono } from 'hono';
import type { Auth } from './auth';

type AppOptions = {
  auth: Auth;
  /** The built SPA (apps/web/dist). When set, the server serves it, with index.html as the fallback for client-side routes. */
  webDistDir?: string;
};

export function createApp(options: AppOptions) {
  // Routes are chained so Hono RPC can infer AppType.
  // /healthz never touches the database, so uptime checks let Neon sleep.
  const app = new Hono().get('/healthz', (c) => c.json({ status: 'ok' } satisfies HealthzResponse));

  // Better Auth's routes. Registered without chaining: the web app reaches them through
  // Better Auth's own client, not the typed hc client.
  app.on(['GET', 'POST'], '/api/auth/*', (c) => options.auth.handler(c.req.raw));

  if (options.webDistDir) {
    // Registered without chaining, so the SPA routes stay out of AppType.
    const indexHtml = readFileSync(join(options.webDistDir, 'index.html'), 'utf8');
    app.use('/*', serveStatic({ root: options.webDistDir }));
    app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.notFound() : c.html(indexHtml)));
  }

  return app;
}

export type AppType = ReturnType<typeof createApp>;
