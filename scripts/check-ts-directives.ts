// Part of `pnpm lint`: every `@ts-expect-error` must say why, e.g.
// `// @ts-expect-error -- the library's types miss the overload`. Biome bans `@ts-ignore`
// but has no rule for this, and ESLint is kept to its three type-aware rules.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '--', '*.ts', '*.tsx'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((path) => path.length > 0 && !path.startsWith('.claude/skills/') && existsSync(path));

const bare = /@ts-expect-error\s*(?:\*\/)?\s*$/;
const problems: string[] = [];
for (const path of files) {
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (bare.test(line)) problems.push(`${path}:${index + 1}`);
    });
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`${problem}  @ts-expect-error needs a reason after it`);
  }
  process.exit(1);
}
