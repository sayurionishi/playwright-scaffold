/**
 * Constitution checks that ESLint cannot express.
 *
 *   npm run guard
 *
 * ESLint sees ASTs, so it can only police the CONTENT of files it parses. Two Constitution rules
 * are about the existence and shape of files themselves, which is invisible to it:
 *
 *   #12  no `.json` static test data — a `.json` file is never linted, so ESLint can never see it
 *   #13  `test.skip` must carry a `// FIXME: <ticket>` — comment-adjacency is awkward in ESLint,
 *        and a skipped test is exactly the case where a silent pass costs the most
 *
 * Everything else belongs in `eslint.config.mjs`, where a violation reports a line number. Resist
 * growing this file: a grep-based check cannot autofix, cannot be disabled with a justification,
 * and does not show up in an editor.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';

interface Violation {
  rule: number;
  file: string;
  line?: number;
  message: string;
}

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'playwright-report',
  'test-results',
  'blob-report',
  '.auth',
]);

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Rule #12 — static test data lives in `.ts` with `as const`, never `.json`. */
async function checkNoJsonTestData(): Promise<Violation[]> {
  const dir = path.resolve(ROOT, 'test-data');
  const files = await walk(dir);
  return files
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      rule: 12,
      file: path.relative(ROOT, f),
      message:
        'Static test data must be `.ts` with `as const`, not `.json`. A JSON file has no types, ' +
        'is never type-checked, is never linted, and cannot reference an enum — so a stale value ' +
        'in it fails at runtime instead of at compile time.',
    }));
}

/** Rule #13 — a skipped test must say which bug it is waiting on. */
async function checkSkipsHaveFixme(): Promise<Violation[]> {
  const dir = path.resolve(ROOT, 'tests');
  const files = (await walk(dir)).filter((f) => f.endsWith('.ts'));
  const violations: Violation[] = [];

  for (const file of files) {
    const lines = (await fs.readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      // `test.skip()` used as a conditional guard (`test.skip(!cond, 'reason')`) is legitimate
      // control flow, not a silenced failure. Only a declaration-form skip needs a ticket.
      if (!/^\s*(test|it)\.skip\s*\(\s*['"`]/.test(line)) return;
      const context = [lines[index - 2], lines[index - 1], line].join('\n');
      if (/FIXME:/.test(context)) return;
      violations.push({
        rule: 13,
        file: path.relative(ROOT, file),
        line: index + 1,
        message:
          'A skipped test needs `// FIXME: <ticket>` on or just above it. A skip with no ticket ' +
          'is indistinguishable from a test someone gave up on, and it passes CI forever.',
      });
    });
  }
  return violations;
}

const violations = [...(await checkNoJsonTestData()), ...(await checkSkipsHaveFixme())];

if (violations.length === 0) {
  console.log('✓ Constitution guard: rules #12 and #13 clean.');
} else {
  console.error(`\n✖ Constitution guard found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    const where = v.line === undefined ? v.file : `${v.file}:${v.line}`;
    console.error(`  Constitution #${v.rule} — ${where}`);
    console.error(`    ${v.message}\n`);
  }
  process.exitCode = 1;
}
