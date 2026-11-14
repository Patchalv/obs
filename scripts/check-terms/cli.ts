// `pnpm check:terms`: fails when an identifier, file name or migration SQL name under
// apps/ or packages/ uses a banned term from check-terms.config.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { scanFile, type TermsConfig } from './terms.ts';

const config = JSON.parse(readFileSync('check-terms.config.json', 'utf8')) as TermsConfig;

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'apps', 'packages'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((path) => path.length > 0 && existsSync(path));

const violations = files.flatMap((path) => scanFile(path, readFileSync(path, 'utf8'), config));

for (const { path, line, name, terms } of violations) {
  const where = line > 0 ? `${path}:${line}` : path;
  console.error(`${where}  "${name}" uses banned term: ${terms.join(', ')}`);
}

if (violations.length > 0) {
  console.error(
    `\ncheck:terms found ${violations.length} banned term(s). Use the GLOSSARY.md term, or add an exception with a reason to check-terms.config.json.`,
  );
  process.exit(1);
}
console.log(`check:terms: ${files.length} files clean`);
