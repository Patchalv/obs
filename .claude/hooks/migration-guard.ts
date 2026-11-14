// PreToolUse hook for Edit|Write: applied migrations are immutable.
// Blocks an edit to any file under the migrations folder that already exists on
// origin/master. Migrations created on the current branch stay editable until merged.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const MIGRATIONS_DIR = 'apps/server/src/db/migrations/';

type Decision = { block: false } | { block: true; reason: string };

export function checkMigrationEdit(filePath: string, repoRoot: string): Decision {
  const absolute = isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath);
  const path = relative(repoRoot, absolute).split(sep).join('/');
  if (!path.startsWith(MIGRATIONS_DIR)) {
    return { block: false };
  }
  const onMaster = spawnSync('git', ['cat-file', '-e', `origin/master:${path}`], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  if (onMaster.status !== 0) {
    return { block: false };
  }
  return {
    block: true,
    reason: `${path} is already on origin/master, and applied migrations are immutable. Write a new migration instead (expand/contract).`,
  };
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, 'utf8')) as { tool_input?: { file_path?: string } };
  const filePath = input.tool_input?.file_path;
  const decision = filePath
    ? checkMigrationEdit(filePath, process.env.CLAUDE_PROJECT_DIR ?? process.cwd())
    : { block: false as const };
  if (decision.block) {
    console.error(decision.reason);
    process.exit(2);
  }
}
