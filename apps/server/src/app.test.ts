import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('GET /healthz', () => {
  it('answers ok', async () => {
    const res = await createApp().request('/healthz');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('serving the built SPA', () => {
  function builtSpa(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ping-web-dist-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Ping</title>');
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'main.js'), 'console.log(1);');
    return dir;
  }

  it('serves index.html at the root', async () => {
    const res = await createApp({ webDistDir: builtSpa() }).request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Ping</title>');
  });

  it('serves built assets', async () => {
    const res = await createApp({ webDistDir: builtSpa() }).request('/assets/main.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('console.log(1);');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await createApp({ webDistDir: builtSpa() }).request('/channels/123');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Ping</title>');
  });

  it('does not answer unknown API paths with the SPA', async () => {
    const res = await createApp({ webDistDir: builtSpa() }).request('/api/nothing-here');
    expect(res.status).toBe(404);
  });

  it('still answers /healthz', async () => {
    const res = await createApp({ webDistDir: builtSpa() }).request('/healthz');
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
