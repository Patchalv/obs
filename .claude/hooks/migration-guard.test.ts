import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkMigrationEdit } from './migration-guard.ts';

const MIGRATIONS = 'apps/server/src/db/migrations';

/** A repo whose origin/master holds one applied migration and one other file. */
function repoWithAppliedMigration(): string {
  const repo = mkdtempSync(join(tmpdir(), 'ping-migration-guard-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: 'pipe', encoding: 'utf8' });
  git('init', '-q', '-b', 'master');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  mkdirSync(join(repo, MIGRATIONS), { recursive: true });
  writeFileSync(join(repo, MIGRATIONS, '0001_init.sql'), 'CREATE TABLE channel ();');
  writeFileSync(join(repo, 'README.md'), 'readme');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  git('update-ref', 'refs/remotes/origin/master', 'HEAD');
  return repo;
}

describe('checkMigrationEdit', () => {
  it('blocks a migration that exists on origin/master', () => {
    const repo = repoWithAppliedMigration();
    const result = checkMigrationEdit(join(repo, MIGRATIONS, '0001_init.sql'), repo);
    expect(result.block).toBe(true);
  });

  it('allows a migration created on the current branch', () => {
    const repo = repoWithAppliedMigration();
    const result = checkMigrationEdit(join(repo, MIGRATIONS, '0002_thread.sql'), repo);
    expect(result.block).toBe(false);
  });

  it('allows other files that exist on origin/master', () => {
    const repo = repoWithAppliedMigration();
    expect(checkMigrationEdit(join(repo, 'README.md'), repo).block).toBe(false);
  });
});

describe('the hook process', () => {
  const hook = fileURLToPath(new URL('./migration-guard.ts', import.meta.url));
  const run = (repo: string, filePath: string) =>
    spawnSync('node', [hook], {
      input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
      env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
      encoding: 'utf8',
    });

  it('exits 2 with the reason for an applied migration', () => {
    const repo = repoWithAppliedMigration();
    const result = run(repo, join(repo, MIGRATIONS, '0001_init.sql'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('applied migrations are immutable');
  });

  it('exits 0 for a new migration', () => {
    const repo = repoWithAppliedMigration();
    expect(run(repo, join(repo, MIGRATIONS, '0002_thread.sql')).status).toBe(0);
  });
});
