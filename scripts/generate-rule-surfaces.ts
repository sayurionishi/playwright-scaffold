/**
 * Generate every AI-rule surface from `rules/constitution.ts`.
 *
 *   npm run rules:generate   # write the surfaces
 *   npm run rules:check      # fail if any surface is stale or hand-edited (CI)
 *
 * ── HOW IT WRITES ─────────────────────────────────────────────────────────────────────────────
 * Generated content is fenced by markers:
 *
 *     <!-- BEGIN GENERATED: <block> — edit rules/constitution.ts, run npm run rules:generate -->
 *     …generated…
 *     <!-- END GENERATED: <block> -->
 *
 * Only the text BETWEEN markers is replaced, so hand-written prose in the same file survives. A
 * file whose markers are missing is reported rather than silently overwritten — losing someone's
 * prose to a generator is worse than a failed check.
 *
 * `docs/PARITY-MATRIX.md` is the exception: fully generated, no hand-written half, because its
 * whole value is that it cannot disagree with the rule source.
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { format as prettierFormat, resolveConfig as resolvePrettierConfig } from 'prettier';
import {
  CONSTITUTION,
  applyToFor,
  rulesByTopic,
  scopeGaps,
  type Topic,
} from '../rules/constitution';
import { TASK_PROMPTS, type TaskPrompt } from '../rules/tasks';

const ROOT = process.cwd();
const CHECK_ONLY = process.argv.includes('--check');

interface Surface {
  file: string;
  /** Marker name; omit for a fully generated file. */
  block?: string;
  /** Set for a path-scoped instruction file, whose `applyTo` frontmatter is kept in sync. */
  topic?: Topic;
  render: () => string;
}

// ── renderers ─────────────────────────────────────────────────────────────────────────────────

/**
 * Rules with a MECHANICAL gate — lint, the guard script, or the type system. Everything else is
 * review-only.
 *
 * This is the single definition of "blocking". Both `docs/PARITY-MATRIX.md` and the CLAUDE.md
 * enforcement paragraph read it, because the previous arrangement — a generated matrix plus a
 * HAND-WRITTEN sentence in CLAUDE.md — drifted exactly as you would expect: Phase 4 raised
 * enforcement from 2 rules to 13, regenerated the matrix, and left CLAUDE.md claiming 2. A number
 * that is asserted in prose is a number that will rot.
 */
function blockingRules(): typeof CONSTITUTION {
  return CONSTITUTION.filter((r) => {
    const e = r.enforcement;
    return (
      (e.kind === 'eslint' && e.blocking) || e.kind === 'guard-script' || e.kind === 'type-system'
    );
  }) as unknown as typeof CONSTITUTION;
}

/**
 * Blocking rules whose LINT SCOPE does not cover everywhere the RULE claims to apply.
 *
 * Compared per top-level directory, so `tests/**` vs `tests/**' + '/*.spec.ts` counts as covered —
 * that narrowing is real but inert, since `tests/` holds only specs. What this catches is a rule
 * declared for several directories and enforced in one. Naming the uncovered directories is the
 * whole job of this file: the previous hand-written version asserted "rule #1 … only inside the
 * spec glob", which stopped being true when Phase 4 widened #1, and hid the rule that IS narrow.
 */
function narrowlyScoped(): { id: number; uncovered: string[] }[] {
  const dir = (glob: string): string => glob.split('/')[0] ?? glob;
  return blockingRules()
    .map((r) => {
      const e = r.enforcement;
      if (e.kind !== 'eslint') return { id: r.id, uncovered: [] };
      const covered = new Set(e.scope.split(',').map((g) => dir(g.trim())));
      return {
        id: r.id,
        uncovered: [...new Set(r.appliesTo.map(dir))].filter((d) => !covered.has(d)),
      };
    })
    .filter((r) => r.uncovered.length > 0);
}

/**
 * The CLAUDE.md §1 enforcement paragraph. Generated for the reason above: this sentence used to be
 * hand-written and went stale by 11 rules.
 */
function claudeEnforcement(): string {
  const blocking = blockingRules();
  const reviewOnly = CONSTITUTION.filter((r) => !blocking.some((b) => b.id === r.id));
  const reviewList = reviewOnly.map((r) => `#${r.id}`).join(' and ');
  return [
    `Today **${blocking.length} of the ${CONSTITUTION.length} rules are mechanically blocking**: a violation`,
    'fails `npm run lint` or `npm run guard`, and so fails the CI `quality` job. The remaining',
    `${reviewOnly.length} (${reviewList}) ${reviewOnly.length === 1 ? 'is' : 'are'} review-only — the honest answer, not a gap. ${reviewOnly.length === 1 ? 'It asks' : 'They ask'} whether a value`,
    'was invented or read from a real source, and no linter can see that.',
    '',
    'Per-rule detail — including the one rule enforced more narrowly than it is declared — is in',
    '**`docs/PARITY-MATRIX.md`**. Both that file and this paragraph are generated from',
    '`rules/constitution.ts`, so neither can overclaim: to make either say a rule is blocking, you',
    'have to make the rule blocking.',
  ].join('\n');
}

/** The CLAUDE.md §1 table: `| # | Forbidden | Instead |`. */
function claudeTable(): string {
  const rows = CONSTITUTION.map((r) => `| ${r.id} | ${cell(r.forbidden)} | ${cell(r.instead)} |`);
  return ['| #   | Forbidden | Instead |', '| --- | --------- | ------- |', ...rows].join('\n');
}

/** Copilot's repo-wide numbered list. Includes EVERY rule — the hand-written copy omitted #15. */
function copilotHardStops(): string {
  return CONSTITUTION.map((r) => {
    const profile = r.profile !== undefined ? ` _(\`${r.profile}\` profile)_` : '';
    return `${r.id}. ${stripMd(r.forbidden)} — ${stripMd(r.instead)}${profile}`;
  }).join('\n');
}

/** A path-scoped instruction file's hard-rule block. */
function topicRules(topic: Topic): string {
  const rules = rulesByTopic(topic);
  if (rules.length === 0) return '_No Constitution rules are scoped to this path._';
  return rules.map((r) => `- **Rule #${r.id}** — ${r.forbidden}. ${r.instead}`).join('\n');
}

/** AGENTS.md body — the cross-tool entry point (Cursor, Zed, aider, Codex, …). */
function agentsBody(): string {
  return [
    '## Hard stops (refuse to generate these)',
    '',
    copilotHardStops(),
    '',
    '## Where the detail lives',
    '',
    'This file is deliberately thin. The full rules, with rationale and worked examples, are in:',
    '',
    '- `CLAUDE.md` — the constitution, the workflow, and the skill index.',
    '- `.claude/skills/<name>/SKILL.md` — one skill per topic, loaded on demand.',
    '- `.github/instructions/*.instructions.md` — the same rules scoped to the paths they govern.',
    '- `docs/PARITY-MATRIX.md` — which rules a tool actually blocks, and which are review-only.',
    '',
    'Every one of those is generated from `rules/constitution.ts`, so they cannot disagree.',
  ].join('\n');
}

/** The defence-in-depth matrix. Generated so it can never overclaim. */
function parityMatrix(): string {
  const rows = CONSTITUTION.map((r) => {
    const e = r.enforcement;
    let mechanism: string;
    let blocking: string;
    if (e.kind === 'eslint') {
      mechanism = `ESLint \`${e.rule}\` (${e.scope})`;
      blocking = e.blocking ? '**Yes**' : 'No — warning only';
    } else if (e.kind === 'guard-script') {
      mechanism = `Guard script — ${e.check}`;
      blocking = '**Yes**';
    } else if (e.kind === 'type-system') {
      mechanism = 'TypeScript (compile error)';
      blocking = '**Yes**';
    } else {
      mechanism = 'Review only';
      blocking = 'No';
    }
    const note =
      e.kind === 'review'
        ? e.mechanizable === false
          ? 'Not mechanizable — it is about process, not syntax.'
          : `Mechanizable: ${e.mechanizable}`
        : e.kind === 'type-system'
          ? e.how
          : ((e as { gap?: string }).gap ?? '—');
    return `| #${r.id} | ${cell(stripMd(r.forbidden))} | ${cell(mechanism)} | ${blocking} | ${cell(note)} |`;
  });

  const blocking = blockingRules();
  const blockingCount = blocking.length;
  const reviewOnly = CONSTITUTION.filter((r) => !blocking.some((b) => b.id === r.id));

  return [
    '<!-- This file is FULLY GENERATED from rules/constitution.ts. Do not edit it by hand. -->',
    '',
    '# Defence-in-depth parity matrix',
    '',
    'Which Constitution rules a tool actually blocks, and which rely on review.',
    '',
    'This file is generated from the `enforcement` field of each rule in `rules/constitution.ts`, so',
    'it cannot overclaim: to make a row say **Yes**, you have to make the rule actually blocking.',
    'That matters, because the hand-written claim this replaces ("a hook (ESLint) enforces #1, #2,',
    '#5") was wrong about all three — there was no hook, #1 was scoped to spec files only, and #2',
    'was a non-blocking warning.',
    '',
    `**${blockingCount} of ${CONSTITUTION.length} rules are mechanically blocking today.**`,
    '',
    '| Rule | Forbidden | Mechanism | Blocks the build? | Notes |',
    '| ---- | --------- | --------- | ----------------- | ----- |',
    ...rows,
    '',
    '## How to read this',
    '',
    '- **Blocks the build** means a violation fails `npm run lint` (or the guard script) and',
    '  therefore fails the CI `quality` job. Anything else is caught by a human, or not at all.',
    ...(narrowlyScoped().length > 0
      ? [
          '- **Enforced more narrowly than it is declared.** These rules are blocking, but the lint',
          '  scope misses directories the rule itself claims to cover — a violation there ships:',
          ...narrowlyScoped().map(
            (r) =>
              `  - rule #${r.id} — not checked in ${r.uncovered.map((d) => `\`${d}/\``).join(', ')}`,
          ),
        ]
      : ['- Every blocking rule is enforced across every directory it declares. No scope gaps.']),
    ...(reviewOnly.length > 0
      ? [
          `- Review-only is a legitimate answer for ${reviewOnly
            .map((r) => `rule #${r.id} (${stripMd(r.forbidden)})`)
            .join(' and ')} — that is a question about`,
          '  process, not syntax, and no linter can see it.',
        ]
      : []),
  ].join('\n');
}

/**
 * A Claude Code slash command. Claude asks for missing inputs conversationally, so the
 * `${input:…}` placeholders are rewritten into plain prose rather than left as literal syntax.
 */
function claudeCommand(task: TaskPrompt): string {
  const body = task.inputs === undefined ? task.body : stripInputSyntax(task.body);
  const ask =
    task.inputs === undefined
      ? ''
      : `\nIf the user has not already said ${task.inputs
          .map((i) => `**${i.placeholder}**`)
          .join(' and ')}, ask before starting.\n`;
  return `---\ndescription: ${task.description}\n---\n\n${body}\n${ask}`;
}

/** A Copilot prompt file. Keeps the `${input:…}` syntax, which VS Code prompts for. */
function copilotPrompt(task: TaskPrompt): string {
  const front = ['---', `description: ${task.description}`, 'mode: agent', '---', ''].join('\n');
  return `${front}\n${task.body}\n`;
}

/**
 * `${input:key}` → `<key>`, for the tool that asks conversationally.
 *
 * Angle brackets rather than the placeholder prose: substituting the prose produced sentences like
 * "at the **the layer** layer", and a reader cannot tell a filled-in value from a placeholder.
 * `<layer>` is unambiguously a blank to fill.
 */
function stripInputSyntax(body: string): string {
  return body.replace(/\$\{input:([^:}]+)(?::[^}]*)?\}/g, (_match, key) => `<${key}>`);
}

/** Copilot/AGENTS lists render as plain text, so drop the markdown emphasis that suits a table. */
function stripMd(s: string): string {
  return s.replace(/\*\*/g, '');
}

/**
 * Escape `|` so a cell's content cannot split the markdown table.
 * Rule #10's mechanization note contains a regex alternation (`/Page$|Component$/`), which added a
 * phantom column before this existed.
 */
function cell(s: string): string {
  return s.replace(/\|/g, '\\|');
}

// ── surfaces ──────────────────────────────────────────────────────────────────────────────────

const TOPICS: readonly Topic[] = [
  'specs',
  'pages-and-selectors',
  'waits',
  'api-and-security',
  'salesforce',
];

const SURFACES: readonly Surface[] = [
  { file: 'CLAUDE.md', block: 'constitution', render: claudeTable },
  { file: 'CLAUDE.md', block: 'enforcement', render: claudeEnforcement },
  { file: '.github/copilot-instructions.md', block: 'hard-stops', render: copilotHardStops },
  { file: 'AGENTS.md', block: 'agents', render: agentsBody },
  { file: 'docs/PARITY-MATRIX.md', render: parityMatrix },
  ...TOPICS.map((topic) => ({
    file: `.github/instructions/${topic}.instructions.md`,
    block: 'rules',
    topic,
    render: () => topicRules(topic),
  })),
  // Task prompts: fully generated in both formats, so the two tools cannot drift.
  ...TASK_PROMPTS.flatMap((task) => [
    { file: `.claude/commands/${task.name}.md`, render: () => claudeCommand(task) },
    { file: `.github/prompts/${task.name}.prompt.md`, render: () => copilotPrompt(task) },
  ]),
];

// ── engine ────────────────────────────────────────────────────────────────────────────────────

function markers(block: string): { begin: string; end: string } {
  return {
    begin: `<!-- BEGIN GENERATED: ${block} — edit rules/constitution.ts, run npm run rules:generate -->`,
    end: `<!-- END GENERATED: ${block} -->`,
  };
}

function replaceBlock(source: string, block: string, body: string): string | null {
  const { begin, end } = markers(block);
  const start = source.indexOf(begin);
  const finish = source.indexOf(end);
  if (start === -1 || finish === -1 || finish < start) return null;
  return `${source.slice(0, start + begin.length)}\n\n${body}\n\n${source.slice(finish)}`;
}

/**
 * Keep an instruction file's `applyTo` frontmatter equal to the union of its rules' globs.
 *
 * This is the mechanical half of "keep applyTo globs specific and non-overlapping": a rule scoped
 * to `tests/**` whose instruction file only declares `applyTo: 'pages/**'` is silent exactly where
 * it is meant to fire — which was true of the selector rules before this existed.
 */
function syncApplyTo(source: string, topic: Topic): string {
  const desired = applyToFor(topic);
  if (desired === '') return source;
  const line = /^applyTo:\s*'[^']*'$/m;
  if (!line.test(source)) return source;
  return source.replace(line, `applyTo: '${desired}'`);
}

async function formatMarkdown(source: string, targetPath: string): Promise<string> {
  // Match the repo's own Prettier config, or `prettier --check` would reject what we just wrote.
  // resolveConfig needs a FILE path to search upward from, not a directory.
  const config = await resolvePrettierConfig(targetPath);
  return prettierFormat(source, { ...config, parser: 'markdown' });
}

async function main(): Promise<void> {
  const stale: string[] = [];
  const missing: string[] = [];

  for (const surface of SURFACES) {
    const target = path.resolve(ROOT, surface.file);
    const body = surface.render();

    let next: string;
    if (surface.block === undefined) {
      next = `${body}\n`;
    } else {
      let current: string;
      try {
        current = await fs.readFile(target, 'utf8');
      } catch {
        missing.push(
          `${surface.file} (file not found — create it with the ${surface.block} markers)`,
        );
        continue;
      }
      const replaced = replaceBlock(current, surface.block, body);
      if (replaced === null) {
        missing.push(`${surface.file} (missing the "${surface.block}" markers)`);
        continue;
      }
      next = surface.topic === undefined ? replaced : syncApplyTo(replaced, surface.topic);
    }

    next = await formatMarkdown(next, target);

    const existing = await fs.readFile(target, 'utf8').catch(() => '');
    if (existing === next) continue;

    if (CHECK_ONLY) {
      stale.push(surface.file);
    } else {
      await fs.writeFile(target, next, 'utf8');
      console.log(`  wrote ${surface.file}`);
    }
  }

  if (missing.length > 0) {
    console.error('\n✖ Cannot generate into:');
    for (const m of missing) console.error(`    ${m}`);
    process.exitCode = 1;
  }

  if (CHECK_ONLY && stale.length > 0) {
    console.error('\n✖ These AI-rule surfaces are out of date or were hand-edited:\n');
    for (const f of stale) console.error(`    ${f}`);
    console.error(
      '\n  The rules live in rules/constitution.ts and every surface is generated from it, so a\n' +
        '  hand-edit here would silently drift the way the old hand-maintained copies did.\n' +
        '  Fix: edit rules/constitution.ts, run `npm run rules:generate`, commit both.\n',
    );
    process.exitCode = 1;
    return;
  }

  const gaps = scopeGaps();
  if (!CHECK_ONLY && gaps.length > 0) {
    console.log('\n  Rules whose scope reaches beyond their path-scoped file (carried by');
    console.log('  copilot-instructions.md, which loads for every request):');
    for (const gap of gaps) {
      console.log(`    #${gap.id} also applies to: ${gap.uncovered.join(', ')}`);
    }
    console.log('');
  }

  if (missing.length === 0) {
    console.log(
      CHECK_ONLY
        ? `✓ All ${SURFACES.length} AI-rule surfaces match rules/constitution.ts (${CONSTITUTION.length} rules).`
        : `✓ Generated ${SURFACES.length} surfaces from ${CONSTITUTION.length} rules.`,
    );
  }
}

await main();
