import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { createAuth } from '../auth';
import { createDatabase } from '../db';
import { coveredRoutes } from './permission-matrix/matrix';
import { uncoveredRoutes } from './route-coverage';

// The real app, as production builds it: serving a built SPA. Building it never connects
// to the database.
function realApp() {
  const webDistDir = mkdtempSync(join(tmpdir(), 'ping-route-coverage-'));
  writeFileSync(join(webDistDir, 'index.html'), '<!doctype html><title>Ping</title>');
  const auth = createAuth(createDatabase('postgres://nobody@localhost:1/none'), {
    secret: 'route-coverage-test-secret-not-used',
    baseUrl: 'http://localhost:3000',
    trustedOrigins: ['http://localhost:3000'],
  });
  return createApp({ auth, webDistDir });
}

describe('route-coverage guard', () => {
  it('finds a permission-matrix entry or an allowlist entry for every registered route', () => {
    expect(uncoveredRoutes(realApp().routes, coveredRoutes())).toEqual([]);
  });

  it('fails on a route with no matrix entry', () => {
    const app = realApp();
    app.post('/api/channels', (c) => c.json({}));
    expect(uncoveredRoutes(app.routes, coveredRoutes())).toEqual(['POST /api/channels']);
  });

  it('passes a route once the matrix covers it', () => {
    const app = realApp();
    app.post('/api/channels', (c) => c.json({}));
    expect(uncoveredRoutes(app.routes, new Set(['POST /api/channels']))).toEqual([]);
  });

  it('checks each method of a path apart', () => {
    const app = realApp();
    app.get('/api/channels', (c) => c.json({}));
    app.post('/api/channels', (c) => c.json({}));
    expect(uncoveredRoutes(app.routes, new Set(['GET /api/channels']))).toEqual([
      'POST /api/channels',
    ]);
  });

  it('ignores middleware', () => {
    const app = realApp();
    app.use('/api/*', async (_c, next) => next());
    expect(uncoveredRoutes(app.routes, coveredRoutes())).toEqual([]);
  });
});
