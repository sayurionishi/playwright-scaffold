/**
 * THE RULE SOURCE — one machine-readable definition of the Constitution.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 *
 * The same rules previously lived in four hand-maintained places:
 *
 *   CLAUDE.md §1                      (Claude, always loaded)
 *   .claude/skills/**                 (Claude, progressive disclosure)
 *   .github/copilot-instructions.md   (Copilot, repo-wide)
 *   .github/instructions/*            (Copilot, path-scoped)
 *
 * They had already drifted: the Copilot copy listed 14 of the 15 rules (#15 was missing entirely),
 * and rule #2 silently dropped the clause making `networkidle` a hard refusal on the `salesforce`
 * profile. Nothing detected either, because nothing tied the copies together.
 *
 * Now the rule TEXT lives here once, and `scripts/generate-rule-surfaces.ts` writes every surface
 * from it. `npm run rules:check` fails CI if any generated block has been hand-edited or has gone
 * stale. Prose OUTSIDE the generated markers is hand-written and survives regeneration.
 *
 * ── TO CHANGE A RULE ──────────────────────────────────────────────────────────────────────────
 *   1. Edit it here.
 *   2. `npm run rules:generate`
 *   3. Commit both this file and the regenerated surfaces.
 *
 * Never edit a generated block directly — `rules:check` will reject it.
 *
 * ── ENFORCEMENT IS PART OF THE RULE ───────────────────────────────────────────────────────────
 * Each rule carries how it is ACTUALLY enforced, and `docs/PARITY-MATRIX.md` is generated from
 * that field. So the matrix cannot overclaim: to make it say a rule is blocking, you have to make
 * the rule blocking. This exists because the previous hand-written claim ("a hook enforces #1, #2,
 * #5") was false in three ways and went unnoticed.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

/** How a rule is enforced today — the single input to the parity matrix. */
export type Enforcement =
  | {
      kind: 'eslint';
      /** The ESLint rule id that fires. */
      rule: string;
      /** Human description of the glob it is scoped to. */
      scope: string;
      /** True only when a violation fails the build (an 'error', or 'warn' with --max-warnings=0). */
      blocking: boolean;
      /** Set when the scope is narrower than the rule's own `appliesTo` — i.e. a real gap. */
      gap?: string;
    }
  | { kind: 'guard-script'; check: string; blocking: true }
  | {
      kind: 'review';
      /** Whether a cheap mechanical check is possible, and what it would be. */
      mechanizable: false | string;
    };

/** Which path-scoped Copilot instruction file a rule belongs to. */
export type Topic = 'specs' | 'pages-and-selectors' | 'waits' | 'api-and-security' | 'salesforce';

export interface ConstitutionRule {
  id: number;
  /** What is forbidden. Markdown inline formatting allowed. */
  forbidden: string;
  /** What to do instead. Markdown inline formatting allowed. */
  instead: string;
  /** Globs the rule governs. Drives the `applyTo` frontmatter of the generated Copilot files. */
  appliesTo: readonly string[];
  topic: Topic;
  enforcement: Enforcement;
  /** Only active on this profile (recorded in PROJECT.md). Omit for all profiles. */
  profile?: 'salesforce';
}

export const CONSTITUTION: readonly ConstitutionRule[] = [
  {
    id: 1,
    forbidden: '`page.waitForTimeout(...)`',
    instead: 'Web-first assertion or a pre-registered response wait (`wait-strategy`)',
    appliesTo: ['tests/**', 'pages/**', 'helpers/**', 'fixtures/**'],
    topic: 'waits',
    enforcement: {
      kind: 'eslint',
      rule: 'playwright/no-wait-for-timeout',
      scope: 'tests/**/*.spec.ts',
      blocking: true,
      gap: 'Not linted in pages/, helpers/ or fixtures/ — the directories `page-objects` tells you to put waits in.',
    },
  },
  {
    id: 2,
    forbidden: "`page.waitForLoadState('networkidle')` **on an SPA**",
    instead:
      'The specific gating response (`helpers/util/network.ts`). Acceptable ONLY on static/SSR pages that truly go quiet — never on a chatty SPA. **On the `salesforce` profile this is a hard REFUSAL, not a discouragement** (Aura never goes quiet). See `wait-strategy`.',
    appliesTo: ['tests/**', 'pages/**', 'helpers/**'],
    topic: 'waits',
    enforcement: {
      kind: 'eslint',
      rule: 'playwright/no-networkidle',
      scope: 'tests/**/*.spec.ts',
      blocking: false,
      gap: "Severity is 'warn' and `npm run lint` passes no --max-warnings, so a violation exits 0 and CI stays green.",
    },
  },
  {
    id: 3,
    forbidden: 'XPath, CSS-class, nth-child, or auto-generated-id selectors',
    instead: 'Semantic / testId per the active profile (`selectors`)',
    appliesTo: ['pages/**', 'tests/**'],
    topic: 'pages-and-selectors',
    enforcement: {
      kind: 'review',
      mechanizable:
        '`no-restricted-syntax` on a `.locator()` string literal starting with `.`/`#`/`//` or containing `nth-child`; plus `playwright/no-raw-locators` and `no-nth-methods`, which ship with the plugin and are off by default.',
    },
  },
  {
    id: 4,
    forbidden: 'A guessed selector, URL, enum value, endpoint, or UI string',
    instead: '**Explore first** (playwright-cli / OpenAPI) or **ASK**. Never invent.',
    appliesTo: ['**'],
    topic: 'specs',
    enforcement: { kind: 'review', mechanizable: false },
  },
  {
    id: 5,
    forbidden: '`any` type',
    instead: 'A real type or `unknown` + narrowing (`type-safety`)',
    appliesTo: ['**/*.ts'],
    topic: 'api-and-security',
    enforcement: {
      kind: 'eslint',
      rule: '@typescript-eslint/no-explicit-any',
      scope: '**/*.ts, **/*.mts',
      blocking: true,
    },
  },
  {
    id: 6,
    forbidden: '`z.object(...)` for an API schema',
    instead: '`z.strictObject(...)` (catches contract drift)',
    appliesTo: ['fixtures/**', 'test-data/**'],
    topic: 'api-and-security',
    enforcement: {
      kind: 'review',
      mechanizable:
        "`no-restricted-syntax` on `MemberExpression[object.name='z'][property.name='object']` under fixtures/**.",
    },
  },
  {
    id: 7,
    forbidden: 'Skipping `expect(Schema.parse(body))` / `{ schema }` on an API response',
    instead: 'Validate every response body',
    appliesTo: ['tests/**', 'fixtures/**', 'helpers/**'],
    topic: 'api-and-security',
    enforcement: {
      kind: 'review',
      mechanizable:
        'Partly: making `schema` a required option on `ApiRequest` enforces it by TYPE rather than by lint, which is stronger.',
    },
  },
  {
    id: 8,
    forbidden: 'Assertions inside a page object',
    instead: 'Page objects act; specs assert',
    appliesTo: ['pages/**'],
    topic: 'pages-and-selectors',
    enforcement: {
      kind: 'review',
      mechanizable:
        "`no-restricted-syntax` on `CallExpression[callee.name='expect']` scoped to pages/**. Note `playwright/no-standalone-expect` does NOT cover this — see the comment in eslint.config.mjs.",
    },
  },
  {
    id: 9,
    forbidden: 'Raw locators in a spec',
    instead: 'Locators live in page objects only',
    appliesTo: ['tests/**'],
    topic: 'specs',
    enforcement: {
      kind: 'review',
      mechanizable:
        '`playwright/no-raw-locators` scoped to tests/**, configured for `page.locator` (the skills legitimately use `page.getByText` in specs).',
    },
  },
  {
    id: 10,
    forbidden: '`new SomePage(page)` inside a test',
    instead: 'Consume via the fixture (`async ({ somePage }) => …`)',
    appliesTo: ['tests/**'],
    topic: 'specs',
    enforcement: {
      kind: 'review',
      mechanizable:
        '`no-restricted-syntax` on `NewExpression[callee.name=/Page$|Component$/]` under tests/**. Near-zero false positives.',
    },
  },
  {
    id: 11,
    forbidden: 'Hardcoded URL / credential',
    instead: '`process.env.*` via `config/`; paths & messages via `enums/`',
    appliesTo: ['tests/**', 'pages/**', 'helpers/**', 'test-data/**'],
    topic: 'specs',
    enforcement: {
      kind: 'review',
      mechanizable:
        '`no-restricted-syntax` on string literals matching `^https?://` outside config/ and enums/.',
    },
  },
  {
    id: 12,
    forbidden: '`.json` static data',
    instead: '`.ts` with `as const`',
    appliesTo: ['test-data/**'],
    topic: 'specs',
    enforcement: {
      kind: 'review',
      mechanizable:
        'The cheapest of all — one line: `test -z "$(find test-data -name \'*.json\')"`. Not yet wired.',
    },
  },
  {
    id: 13,
    forbidden: 'Silencing a failure (`try/catch` on `expect`, raised timeout, silent `.skip`)',
    instead: 'Fix the root cause; `test.skip` requires `// FIXME: <ticket>`',
    appliesTo: ['tests/**'],
    topic: 'specs',
    enforcement: {
      kind: 'review',
      mechanizable:
        '`no-restricted-syntax` on a `TryStatement` containing an `expect` call, and on `test.setTimeout`. Comment-adjacency for the `// FIXME` requirement is awkward in ESLint — the guard script handles that half.',
    },
  },
  {
    id: 14,
    forbidden: 'More than one tag per test',
    instead:
      'Exactly one (`@smoke`/`@sanity`/`@regression`/`@api`/`@e2e`/`@security`/`@contract`/`@persona`); `@destructive` wins',
    appliesTo: ['tests/**'],
    topic: 'specs',
    enforcement: {
      kind: 'review',
      mechanizable:
        "`no-restricted-syntax` on `Property[key.name='tag'][value.type='ArrayExpression']` — the suite already uses the single-string form at every call site.",
    },
  },
  {
    id: 15,
    forbidden: 'A Salesforce object or field API name written from memory',
    instead: 'Read it from `describe` / `ui-api/object-info` (`salesforce-metadata-contract`)',
    appliesTo: ['**/salesforce/**'],
    topic: 'salesforce',
    profile: 'salesforce',
    enforcement: {
      kind: 'review',
      mechanizable:
        'Not at authoring time — but `tests/salesforce/contract/metadata-drift.spec.ts` catches a wrong field name AFTER the fact, which is the closest thing to enforcement in the set.',
    },
  },
] as const;

/** Rules grouped by the instruction file they belong to. */
export function rulesByTopic(topic: Topic): readonly ConstitutionRule[] {
  return CONSTITUTION.filter((r) => r.topic === topic);
}

/**
 * The `applyTo` frontmatter for each path-scoped instruction file.
 *
 * ⚠️ This is DELIBERATELY hand-declared rather than derived from the rules' own `appliesTo`.
 *
 * A rule's `appliesTo` says where the rule is TRUE; a file's `applyTo` says when Copilot should
 * load that file. They are not the same, and conflating them breaks the guidance to keep these
 * globs specific: rule #5 (`any`) is true for `**\/*.ts`, so deriving the union would make
 * `api-and-security.instructions.md` load on EVERY TypeScript edit — a file about API contracts
 * firing while you edit a page object. Repo-wide rules belong in `copilot-instructions.md`, which
 * is already loaded for every request.
 *
 * Some overlap is correct and unavoidable: a spec file genuinely needs both the spec rules and the
 * wait rules. What to avoid is a file so broad it fires everywhere.
 */
export const TOPIC_SCOPES: Record<Topic, string> = {
  specs: 'tests/**',
  'pages-and-selectors': 'pages/**',
  // Waits span all four on purpose — a blind sleep hidden in a page object or fixture is the
  // problem this rule exists for, and scoping it to specs is what left that gap open.
  waits: 'tests/**,pages/**,helpers/**,fixtures/**',
  'api-and-security': 'tests/api/**,fixtures/api/**,test-data/**',
  salesforce: '**/salesforce/**',
};

/** The `applyTo` frontmatter for a topic. */
export function applyToFor(topic: Topic): string {
  return TOPIC_SCOPES[topic];
}

/**
 * Rules whose `appliesTo` reaches outside their instruction file's `applyTo` — i.e. paths where
 * the rule is true but the path-scoped file will not be loaded.
 *
 * Reported by `rules:generate` so the gap is visible instead of silently widening a glob. A rule
 * listed here is not necessarily wrong: repo-wide rules are carried by `copilot-instructions.md`.
 */
export function scopeGaps(): ReadonlyArray<{ id: number; uncovered: readonly string[] }> {
  return CONSTITUTION.map((rule) => {
    const scope = TOPIC_SCOPES[rule.topic].split(',');
    const uncovered = rule.appliesTo.filter(
      (glob) =>
        glob !== '**' && !scope.some((s) => s === glob || glob.startsWith(s.replace('**', ''))),
    );
    return { id: rule.id, uncovered };
  }).filter((r) => r.uncovered.length > 0);
}
