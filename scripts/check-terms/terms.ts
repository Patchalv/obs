import ts from 'typescript';

export type Violation = {
  path: string;
  /** 1-based line of the name, or 0 when the file path itself is the problem. */
  line: number;
  name: string;
  terms: string[];
};

export type TermsConfig = {
  banned: string[];
  exceptions: { match: string; reason: string }[];
};

function splitWords(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
}

/**
 * Returns the banned terms that appear as whole words in `name` (an identifier,
 * a file path or an SQL name). Simple plurals count: `tickets` matches `ticket`.
 * A name listed exactly in `config.exceptions` is never flagged.
 */
export function findBannedTerms(name: string, config: TermsConfig): string[] {
  if (config.exceptions.some((exception) => exception.match === name)) {
    return [];
  }
  const words = new Set(splitWords(name));
  return config.banned.filter(
    (term) => words.has(term) || words.has(`${term}s`) || words.has(`${term}es`),
  );
}

type Name = { name: string; line: number };

function namesInTypeScript(path: string, source: string): Name[] {
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, false, kind);
  const names: Name[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file));
      names.push({ name: node.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return names;
}

/** Blanks out SQL comments and string literals, keeping newlines so line numbers hold. */
function stripSqlNoise(sql: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ');
  return sql
    .replace(/'(?:[^']|'')*'/g, blank)
    .replace(/--[^\n]*/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank);
}

function namesInSql(sql: string): Name[] {
  const names: Name[] = [];
  stripSqlNoise(sql)
    .split('\n')
    .forEach((text, index) => {
      for (const match of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
        names.push({ name: match[0], line: index + 1 });
      }
    });
  return names;
}

function namesInFile(path: string, source: string): Name[] {
  if (/\.(ts|tsx|mts|cts)$/.test(path)) return namesInTypeScript(path, source);
  if (path.endsWith('.sql')) return namesInSql(source);
  return [];
}

/**
 * Checks one file: its path, plus the identifiers in TypeScript or the names in SQL.
 * String literals and comments are never checked.
 */
export function scanFile(path: string, source: string, config: TermsConfig): Violation[] {
  const violations: Violation[] = [];
  const pathTerms = findBannedTerms(path, config);
  if (pathTerms.length > 0) {
    violations.push({ path, line: 0, name: path, terms: pathTerms });
  }
  const seen = new Set<string>();
  for (const { name, line } of namesInFile(path, source)) {
    const key = `${line}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const terms = findBannedTerms(name, config);
    if (terms.length > 0) {
      violations.push({ path, line, name, terms });
    }
  }
  return violations;
}
