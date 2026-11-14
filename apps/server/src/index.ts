import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';

const port = Number(process.env.PORT ?? '3000');
const webDistDir =
  process.env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url));

// In development Vite serves the SPA; the server only serves a build that exists.
const app = createApp(existsSync(webDistDir) ? { webDistDir } : {});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Ping server listening on http://localhost:${info.port}`);
});
