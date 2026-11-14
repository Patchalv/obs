import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { createAuth } from './auth';
import { loadEnvLocal, readConfig } from './config';
import { createDatabase } from './db';

loadEnvLocal();
const config = readConfig();
const port = Number(process.env.PORT ?? '3000');
const webDistDir =
  process.env.WEB_DIST_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url));

const database = createDatabase(config.databaseUrl);
const auth = createAuth(database, config.auth);

// In development Vite serves the SPA; the server only serves a build that exists.
const app = createApp(existsSync(webDistDir) ? { auth, webDistDir } : { auth });

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Ping server listening on http://localhost:${info.port}`);
});
