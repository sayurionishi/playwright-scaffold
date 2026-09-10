/**
 * Remove the Salesforce pack from a non-Salesforce project.
 *
 *   npm run prune:salesforce            # dry run - prints the plan, changes nothing
 *   npm run prune:salesforce -- --yes   # apply, then verify
 *
 * =============================================================================================
 * WHY THIS IS A SCRIPT AND NOT A CHECKLIST
 *
 * The `bootstrap` skill used to carry a prose prune list, and following it BROKE THE BUILD: the
 * list omitted `fixtures/test-options.ts`, the one file outside the salesforce directories that
 * imports the Salesforce fixtures, so deleting `fixtures/salesforce/` produced an
 * unresolved-module error in every spec. A hand-maintained list of cross-cutting edits will
 * always drift from the code it describes.
 *
 * Two properties fix that class of failure, and both matter more than the deletions themselves:
 *
 *  1. Every edit is ANCHORED, and a missing anchor is FATAL. If the code has moved, this script
 *     stops and names the anchor it could not find. It never applies a partial prune and reports
 *     success - which is exactly how the checklist failed.
 *  2. It VERIFIES ITS OWN RESULT. It ends by running typecheck, lint, format, the Constitution
 *     guard, the rule-surface check, and test discovery. "Pruned" means "provably still green",
 *     not "the files are gone".
 *
 * -- WHY PRUNING IS OPTIONAL, NOT AUTOMATIC ---------------------------------------------------
 *
 * The pack is inert without `SF_LOGIN_URL`: `playwright.config.ts` does not declare the Salesforce
 * projects, the fixtures are lazy, and every `SF_*` read goes through a getter. So NOT pruning is
 * fully correct - which is what makes it safe to offer this rather than force it.
 *
 * What pruning buys is not runtime cost. It is AI-context cost, which for this scaffold is the
 * cost that matters:
 *
 *     ~605 tokens   CLAUDE.md section 7              (always loaded)
 *     ~435 tokens   CLAUDE.md section 4 SF routing   (always loaded)
 *     ~642 tokens   9 Salesforce skill descriptions  (always in the retrieval index)
 *     ------------
 *     ~1,680 tokens per session, plus 43% of the skill index describing an irrelevant platform -
 *     which is a real mis-trigger risk, not just wasted budget.
 *
 * -- IT IS ONE COMMIT, SO IT IS REVERSIBLE ----------------------------------------------------
 *
 * This refuses to run on a dirty tree so the whole prune lands as one reviewable commit you can
 * `git revert`. That is the honest framing: not "one-way", but "one commit to undo".
 * =============================================================================================
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--yes');

/** Thrown for anything that must stop the prune. */
class PruneError extends Error {}

// -- deletions --------------------------------------------------------------------------------

const DELETE_PATHS = [
  // Code
  'config/salesforce.config.ts',
  'enums/salesforce',
  'helpers/salesforce',
  'fixtures/salesforce',
  'pages/salesforce',
  'test-data/salesforce',
  'tests/salesforce',
  'scripts/generate-sobject-schemas.ts',
  'scripts/generate-visible-fields.ts',
  // AI layer
  '.claude/skills/salesforce',
  '.claude/skills/salesforce-async',
  '.claude/skills/salesforce-auth',
  '.claude/skills/salesforce-data',
  '.claude/skills/salesforce-fsc',
  '.claude/skills/salesforce-locators',
  '.claude/skills/salesforce-metadata-contract',
  '.claude/skills/salesforce-personas',
  '.claude/skills/salesforce-waits',
  '.github/instructions/salesforce.instructions.md',
  // Docs and config
  'docs/salesforce',
  'profiles/salesforce.md',
  'env/.env.salesforce.example',
];

// -- anchored edits ---------------------------------------------------------------------------

interface Edit {
  file: string;
  /** Human description, printed in the plan. */
  what: string;
  /** Exact text to find. A missing anchor aborts the whole prune. */
  find: string;
  /** Replacement. Empty string deletes the anchor. */
  replace: string;
}

const EDITS: readonly Edit[] = [
  {
    file: 'fixtures/test-options.ts',
    what: 'drop the Salesforce fixture imports (THE omission that broke every spec)',
    find: `import { test as salesforceOrgTest } from './salesforce/org-fixture';
import { test as salesforceLightningTest } from './salesforce/lightning-fixture';
import { test as salesforcePersonaTest } from './salesforce/persona-fixture';
`,
    replace: '',
  },
  {
    file: 'fixtures/test-options.ts',
    what: 'remove the Salesforce entries from the mergeTests call',
    find: `export const test = mergeTests(
  apiTest,
  pomTest,
  helperTest,
  salesforceOrgTest,
  salesforceLightningTest,
  salesforcePersonaTest,
);`,
    replace: `export const test = mergeTests(apiTest, pomTest, helperTest);`,
  },
  {
    file: 'playwright.config.ts',
    what: 'drop the salesforceConfig import',
    find: `import { salesforceConfig } from './config/salesforce.config';\n`,
    replace: '',
  },
  {
    file: 'playwright.config.ts',
    what: 'drop the hasSalesforceOrg flag',
    find: `const hasSalesforceOrg = (process.env.SF_LOGIN_URL ?? '') !== '';\n`,
    replace: '',
  },
  {
    file: 'eslint.config.mjs',
    what: 'drop the Salesforce contract helpers from the expect-expect allowlist',
    find: `            'assertObjectShape',
            'assertFieldShape',
            'assertObjectCrud',
            'assertFieldAccess',
            'assertVisibleFieldSet',
`,
    replace: '',
  },
];

/** Blocks delimited by a start anchor and an end anchor, removed whole. */
interface BlockEdit {
  file: string;
  what: string;
  start: string;
  /** The block is removed up to (but not including) this text. `END_OF_FILE` truncates. */
  end: string;
}

const BLOCK_EDITS: readonly BlockEdit[] = [
  {
    file: 'playwright.config.ts',
    what: 'remove the conditional Salesforce project overlay',
    start: '    /* ═══ THE SALESFORCE OVERLAY — pres',
    end: '  ],\n});',
  },
  {
    file: 'CLAUDE.md',
    what: 'remove section 7 (the Salesforce pack) - ~605 always-loaded tokens',
    start: '## 7. The Salesforce pack (opt-in overlay)',
    end: 'END_OF_FILE',
  },
  {
    file: 'CLAUDE.md',
    what: 'remove the section 4 Salesforce routing table - ~435 always-loaded tokens',
    start: '### Salesforce (only when `PROJECT.md` profile is `salesforce`)',
    end: 'If nothing matches, default to `common-tasks` or ASK.',
  },
  {
    file: '.github/workflows/playwright.yml',
    what: 'remove the salesforce-contract CI job',
    start: '  # ── Salesforce contract layer (no browser)',
    end: '  ui:\n',
  },
];

/** Regex-driven edits, for places where a literal anchor would be brittle. */
interface RegexEdit {
  file: string;
  what: string;
  pattern: RegExp;
  replace: string;
}

const REGEX_EDITS: readonly RegexEdit[] = [
  {
    file: 'playwright.config.ts',
    /* A regex, not a literal. The literal version of this anchor broke twice: once on an em-dash
       and once on the backticks inside the docblock, which have to be escaped in a template
       literal and so silently stopped matching. Anchoring on the two ends and skipping the middle
       is robust to any rewording of the comment. */
    what: 'drop globalSetup and its docblock (it existed only for the org API-limit pre-flight)',
    pattern:
      /\n {2}\/\*\*\n {3}\* Org API-limit pre-flight[\s\S]*?globalSetup: '\.\/helpers\/salesforce\/global-setup\.ts',/,
    replace: '',
  },
  {
    file: 'rules/constitution.ts',
    what: "drop 'salesforce' from the Topic union",
    pattern: /export type Topic =[^;]+;/,
    replace: `export type Topic = 'specs' | 'pages-and-selectors' | 'waits' | 'api-and-security';`,
  },
  {
    file: 'rules/constitution.ts',
    what: 'drop the salesforce entry from TOPIC_SCOPES',
    pattern: /\n {2}salesforce: '\*\*\/salesforce\/\*\*',/,
    replace: '',
  },
  {
    file: 'playwright.config.ts',
    /* Anchored on the whole docblock, not its middle: starting at the "THE OVERLAY IS
       CONDITIONAL" line would delete the comment terminator too and leave the file with an
       unterminated comment - the same class of silent breakage the prose checklist caused. */
    what: 'remove the overlay rationale docblock (it documents a decision no longer present)',
    pattern: /\/\*\*\n \* [=\u2550]+\n \* THE OVERLAY IS CONDITIONAL[\s\S]*?\n \*\/\n/,
    replace: '',
  },
  {
    file: 'scripts/generate-rule-surfaces.ts',
    what: "drop 'salesforce' from the generated TOPICS list",
    pattern: /\n {2}'salesforce',(?=\n\];)/,
    replace: '',
  },
  {
    file: 'rules/constitution.ts',
    // Rule #15 is the only profile-gated rule. Removing it by regex rather than a literal anchor
    // because its `enforcement` prose is long and likely to be reworded.
    what: 'remove Constitution rule #15 (Salesforce API names from memory)',
    pattern: /\n {2}\{\n {4}id: 15,[\s\S]*?\n {2}\},(?=\n\] as const;)/,
    replace: '',
  },
];

const DROP_SCRIPTS = [
  'sf:schemas',
  'sf:visible-fields',
  'test:contract',
  'test:personas',
  'test:salesforce',
  // Removes itself: once the pack is gone there is nothing left to prune, and leaving the script
  // in place invites someone to run it against a repo it no longer understands.
  'prune:salesforce',
];

// -- helpers ----------------------------------------------------------------------------------

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function run(label: string, command: string, args: string[]): boolean {
  try {
    execFileSync(command, args, { cwd: ROOT, stdio: 'pipe' });
    console.log(`    PASS  ${label}`);
    return true;
  } catch {
    console.log(`    FAIL  ${label}`);
    return false;
  }
}

async function exists(rel: string): Promise<boolean> {
  return fs
    .stat(path.resolve(ROOT, rel))
    .then(() => true)
    .catch(() => false);
}

// -- safety gates -----------------------------------------------------------------------------

async function assertSafe(): Promise<void> {
  // 1. Never prune a Salesforce project.
  const projectMd = await fs.readFile(path.resolve(ROOT, 'PROJECT.md'), 'utf8').catch(() => null);
  if (projectMd !== null && /profile.*salesforce/i.test(projectMd)) {
    throw new PruneError(
      'PROJECT.md records the `salesforce` profile. Refusing to remove the pack this project ' +
        'depends on. If the profile is wrong, fix PROJECT.md first.',
    );
  }
  if (projectMd === null) {
    console.log(
      '  WARNING: no PROJECT.md - the scaffold has not been bootstrapped yet. Pruning is safe,\n' +
        '  but run `bootstrap` first so the profile decision is recorded before deleting anything.\n',
    );
  }

  // 2. Require a clean tree, so the prune is one revertable commit.
  if (APPLY && git('status', '--porcelain') !== '') {
    throw new PruneError(
      'Working tree is not clean. This prune touches ~30 files across code, CI and the AI layer, ' +
        'so it must land as ONE reviewable commit you can `git revert`. Commit or stash first.',
    );
  }
}

// -- plan / apply -----------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('\n  Salesforce pack removal\n  =======================\n');
  await assertSafe();

  const present: string[] = [];
  const already: string[] = [];
  for (const rel of DELETE_PATHS) {
    ((await exists(rel)) ? present : already).push(rel);
  }

  if (present.length === 0) {
    console.log('  Nothing to do - the Salesforce pack is already absent.\n');
    return;
  }

  console.log(`  Delete (${present.length}):`);
  for (const rel of present) console.log(`    -  ${rel}`);
  if (already.length > 0) console.log(`  (${already.length} path(s) already absent)`);

  const editCount = EDITS.length + BLOCK_EDITS.length + REGEX_EDITS.length + 1;
  console.log(`\n  Edit (${editCount}):`);
  for (const edit of EDITS) console.log(`    ~  ${edit.file} - ${edit.what}`);
  for (const edit of BLOCK_EDITS) console.log(`    ~  ${edit.file} - ${edit.what}`);
  for (const edit of REGEX_EDITS) console.log(`    ~  ${edit.file} - ${edit.what}`);
  console.log(`    ~  package.json - drop scripts: ${DROP_SCRIPTS.join(', ')}`);

  console.log('\n  Then: regenerate the rule surfaces, and verify with all six gates.');
  console.log(
    '\n  Left for you (prose, deliberately not scripted - markdown surgery on hand-written text\n' +
      '  is fragile and the remaining token win is small): Salesforce mentions in README.md,\n' +
      '  AI-WORKFLOWS.md, docs/MAINTAINING-THE-AI-LAYER.md, and the one-line "load salesforce-X\n' +
      '  instead" guards in six generic skill descriptions.',
  );

  if (!APPLY) {
    console.log('\n  DRY RUN - nothing changed. Re-run with `--yes` to apply.\n');
    return;
  }

  /* ---------------------------------------------------------------------------------------------
     TWO PHASES, AND THE ORDER IS THE WHOLE POINT.

     The first version of this applied each edit as it went and, on the first missing anchor,
     reported "NOTHING has been changed" - which was FALSE: two files had already been rewritten.
     A tool that misreports what it did is worse than one that fails, because you cannot trust the
     recovery advice either.

     So: validate EVERY anchor against the current files first, collecting all failures. Only if
     the whole plan is applicable does anything get written.
     --------------------------------------------------------------------------------------------- */
  console.log('\n  Validating every anchor before writing anything...');

  const files = new Map<string, string>();
  const involved = new Set<string>([
    ...EDITS.map((e) => e.file),
    ...BLOCK_EDITS.map((e) => e.file),
    ...REGEX_EDITS.map((e) => e.file),
  ]);
  for (const rel of involved) {
    files.set(rel, await fs.readFile(path.resolve(ROOT, rel), 'utf8'));
  }

  const problems: string[] = [];
  for (const edit of EDITS) {
    if (!files.get(edit.file)!.includes(edit.find)) {
      problems.push(`${edit.file}: literal anchor missing - ${edit.what}`);
    }
  }
  for (const edit of BLOCK_EDITS) {
    const source = files.get(edit.file)!;
    const from = source.indexOf(edit.start);
    if (from === -1) {
      problems.push(`${edit.file}: block START missing - ${edit.what}`);
    } else if (
      edit.end !== 'END_OF_FILE' &&
      source.indexOf(edit.end, from + edit.start.length) === -1
    ) {
      problems.push(`${edit.file}: block END missing - ${edit.what}`);
    }
  }
  for (const edit of REGEX_EDITS) {
    if (!edit.pattern.test(files.get(edit.file)!)) {
      problems.push(`${edit.file}: pattern ${String(edit.pattern)} missing - ${edit.what}`);
    }
  }

  if (problems.length > 0) {
    throw new PruneError(
      `${problems.length} anchor(s) no longer match the code:\n` +
        problems.map((p) => `      - ${p}`).join('\n') +
        '\n\n    NOTHING has been changed - this was checked before any write.\n' +
        '    Fix the anchors in scripts/prune-salesforce.ts rather than pruning by hand: a\n' +
        '    partial prune that reports success is the exact failure this script exists to stop.',
    );
  }
  console.log(`    all ${EDITS.length + BLOCK_EDITS.length + REGEX_EDITS.length} anchors matched`);

  // Phase 2: transform in memory, then write once per file.
  console.log('\n  Applying...');
  for (const edit of EDITS) {
    files.set(edit.file, files.get(edit.file)!.replace(edit.find, edit.replace));
  }
  for (const edit of BLOCK_EDITS) {
    const source = files.get(edit.file)!;
    const from = source.indexOf(edit.start);
    const to =
      edit.end === 'END_OF_FILE'
        ? source.length
        : source.indexOf(edit.end, from + edit.start.length);
    files.set(edit.file, `${source.slice(0, from)}${source.slice(to)}`);
  }
  for (const edit of REGEX_EDITS) {
    files.set(edit.file, files.get(edit.file)!.replace(edit.pattern, edit.replace));
  }
  for (const [rel, content] of files) {
    await fs.writeFile(path.resolve(ROOT, rel), content, 'utf8');
  }

  // package.json scripts
  const pkgPath = path.resolve(ROOT, 'package.json');
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { scripts: Record<string, string> };
  for (const name of DROP_SCRIPTS) delete pkg.scripts[name];
  await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  // Deletions last, so an anchor failure above leaves the files intact.
  for (const rel of present) {
    await fs.rm(path.resolve(ROOT, rel), { recursive: true, force: true });
  }
  /* And finally this script itself. After the prune there is nothing left to prune, and this file
     is the last thing in the repo that mentions Salesforce — keeping it would leave dead code that
     lint still has to check and that invites someone to run it against a repo it no longer
     describes. It is recoverable from git history like anything else. */
  await fs.rm(path.resolve(ROOT, 'scripts/prune-salesforce.ts'), { force: true });
  console.log(`    removed ${present.length} path(s), applied every edit`);

  // Regenerate, then format - the generator writes markdown that must satisfy prettier --check.
  console.log('\n  Regenerating rule surfaces...');
  execFileSync('npx', ['tsx', 'scripts/generate-rule-surfaces.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  execFileSync('npx', ['prettier', '--write', '.'], { cwd: ROOT, stdio: 'pipe' });

  // -- verify ---------------------------------------------------------------------------------
  console.log('\n  Verifying (a prune is only done when the tree is provably green):');
  const gates: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    ['typecheck', 'npx', ['tsc', '--noEmit']],
    ['lint', 'npm', ['run', 'lint']],
    ['format:check', 'npm', ['run', 'format:check']],
    ['guard', 'npm', ['run', 'guard']],
    ['rules:check', 'npm', ['run', 'rules:check']],
    ['test discovery', 'npx', ['playwright', 'test', '--list']],
  ];

  const failed = gates.filter(([label, cmd, args]) => !run(label, cmd, [...args]));

  if (failed.length > 0) {
    throw new PruneError(
      `${failed.length} gate(s) failed: ${failed.map(([label]) => label).join(', ')}.\n` +
        '    The prune is NOT complete. Inspect the output above, then either fix forward or\n' +
        '    discard the whole change with `git checkout . && git clean -fd`.',
    );
  }

  console.log(
    '\n  Pruned and verified.\n\n' +
      '  Commit it as one revertable change:\n' +
      '      git add -A && git commit -m "Remove the Salesforce pack (not a Salesforce target)"\n\n' +
      '  Then record the decision in PROJECT.md so a later session does not re-offer it.\n',
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof PruneError) {
    console.error(`\n  FAILED: ${error.message}\n`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
