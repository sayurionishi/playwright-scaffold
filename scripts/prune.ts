/**
 * Remove an opt-in pack this project does not use.
 *
 *   npm run prune                                  # list the packs and what applies here
 *   npm run prune -- --pack=salesforce             # dry run - prints the plan, changes nothing
 *   npm run prune -- --pack=salesforce --yes       # apply, then verify
 *
 * =============================================================================================
 * WHY THIS IS A SCRIPT AND NOT A CHECKLIST
 *
 * The `bootstrap` skill used to carry a prose prune list, and following it BROKE THE BUILD: the
 * list omitted `fixtures/test-options.ts`, the one file outside the salesforce directories that
 * imports the Salesforce fixtures, so deleting `fixtures/salesforce/` produced an
 * unresolved-module error in every spec. A hand-maintained list of cross-cutting edits will
 * always drift from the code it describes. (`profiles/api-only.md` carried the same bug for the
 * UI layer; that one was deleted rather than scripted, because an API-as-SUT suite belongs in
 * `sayurionishi/api-testing-scaffold`, not in a stripped-down copy of this repo.)
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
 * -- THE TIERS, AND WHY PRUNING IS OPTIONAL ---------------------------------------------------
 *
 * The overlay is layered, and each tier is inert without its trigger. Tier 2 needs `SF_LOGIN_URL`
 * before `playwright.config.ts` declares any Salesforce project; tier 3 is skills only. Fixtures
 * are lazy and every `SF_*` read goes through a getter, so NOT pruning is fully correct - which
 * is what makes it safe to OFFER this rather than force it.
 *
 * What pruning buys is not runtime cost. It is AI-context cost, which for this scaffold is the
 * cost that matters:
 *
 *     `salesforce` (tier 2 + 3)          ~1,680 tokens/session, and 43% of the skill index
 *     `salesforce-fsc` (tier 3 alone)    ~97 tokens/session, plus one 87-line skill
 *
 * The second number is small and is not the reason that pack exists: it completes the tier model
 * so a non-FSC org can say so and be believed, and it costs almost nothing now that the pack
 * machinery is here. Do not oversell it.
 *
 * -- ORDER MATTERS ----------------------------------------------------------------------------
 *
 * `salesforce-fsc` must be pruned BEFORE `salesforce`, never after: the tier-2 pack deletes the
 * files tier 3's anchors live in (and this script with them). Running fsc first, then salesforce,
 * composes fine. The reverse is refused rather than left to fail on a missing anchor.
 *
 * -- IT IS ONE COMMIT, SO IT IS REVERSIBLE ----------------------------------------------------
 *
 * This refuses to run on a dirty tree so each prune lands as one reviewable commit you can
 * `git revert`. That is the honest framing: not "one-way", but "one commit to undo".
 * =============================================================================================
 */
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const APPLY = process.argv.includes('--yes');
const PACK_ARG = process.argv.find((a) => a.startsWith('--pack='))?.slice('--pack='.length);

/** Thrown for anything that must stop the prune. */
class PruneError extends Error {}

// -- the pack model ---------------------------------------------------------------------------

/** A literal find/replace. A missing anchor aborts the whole prune. */
interface Edit {
  file: string;
  /** Human description, printed in the plan. */
  what: string;
  /** Exact text to find. */
  find: string;
  /** Replacement. Empty string deletes the anchor. */
  replace: string;
}

/** A block delimited by a start anchor and an end anchor, removed whole. */
interface BlockEdit {
  file: string;
  what: string;
  start: string;
  /** The block is removed up to (but not including) this text. `END_OF_FILE` truncates. */
  end: string;
}

/** A regex-driven edit, for places where a literal anchor would be brittle. */
interface RegexEdit {
  file: string;
  what: string;
  pattern: RegExp;
  replace: string;
}

interface Pack {
  id: string;
  title: string;
  /** One line, printed by `npm run prune` with no arguments. */
  summary: string;
  /** What removing it saves, stated honestly — including when the answer is "not much". */
  worth: string;
  deletePaths: readonly string[];
  edits: readonly Edit[];
  blockEdits: readonly BlockEdit[];
  regexEdits: readonly RegexEdit[];
  /** `package.json` scripts to remove. */
  dropScripts: readonly string[];
  /** Constitution rule ids to remove from `rules/constitution.ts`. */
  dropRuleIds: readonly number[];
  /** True for the pack that owns this script: after it runs there is nothing left to prune. */
  deletesThisScript: boolean;
  /** Return a refusal message, or null if the pack may be pruned. */
  refuse: (ctx: RefusalContext) => Promise<string | null>;
  /** Prose edits deliberately not scripted. Printed in the plan so nothing is silently missed. */
  manualFollowUps: string;
}

interface RefusalContext {
  projectMd: string | null;
  exists: (rel: string) => Promise<boolean>;
}

/**
 * Remove one Constitution rule by id.
 *
 * A generated regex rather than a literal anchor because a rule's `forbidden`/`instead`/
 * `enforcement` prose is long and gets reworded; its `id:` line does not.
 */
function dropRuleById(id: number): RegexEdit {
  return {
    file: 'rules/constitution.ts',
    what: `remove Constitution rule #${id}`,
    pattern: new RegExp(`\\n {2}\\{\\n {4}id: ${id},[\\s\\S]*?\\n {2}\\},(?=\\n\\] as const;)`),
    replace: '',
  };
}

// -- pack: salesforce (tier 2 + tier 3) -------------------------------------------------------

const SALESFORCE: Pack = {
  id: 'salesforce',
  title: 'the Salesforce pack',
  summary: 'tiers 2 and 3 — every Salesforce skill, project, fixture, page object and test',
  worth:
    '~1,680 always-loaded tokens per session (CLAUDE.md §7 + the §4 routing table + 9 skill\n' +
    '    descriptions), and 43% of the skill retrieval index describing a platform you are not\n' +
    '    testing — a mis-trigger risk, not only a budget one.',
  deletePaths: [
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
  ],
  edits: [
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
      file: 'rules/constitution.ts',
      /* Editing the SOURCE, not the rendered output. Rule #2's text mentions the salesforce
         profile, so it reaches CLAUDE.md §1, AGENTS.md, copilot-instructions.md and the topic
         instruction files. Patching any of those would be undone by the next `rules:generate`. */
      what: "drop the salesforce clause from rule #2's text (flows to 4 generated surfaces)",
      find: '**On the `salesforce` profile this is a hard REFUSAL, not a discouragement** (Aura never goes quiet). ',
      replace: '',
    },
    {
      file: 'rules/constitution.ts',
      what: "drop the Salesforce example from rule #6's parity-matrix note",
      find: 'which a Salesforce describe payload legitimately needs.',
      replace: 'which some third-party payloads legitimately need.',
    },
    {
      file: 'PROJECT.md.template',
      what: 'drop salesforce from the profile options',
      find: '- **App type / profile:** <generic | controlled | salesforce | api-only>',
      replace: '- **App type / profile:** <generic | controlled | api-only>',
    },
    {
      file: 'PROJECT.md.template',
      what: 'drop Salesforce from the tech-stack example',
      find: '<e.g. React SPA, Salesforce Lightning, FastAPI backend>',
      replace: '<e.g. React SPA, FastAPI backend>',
    },
    {
      file: 'rules/tasks.ts',
      /* Source again, not output: these two lines render into `.claude/commands/*.md` AND
         `.github/prompts/*.prompt.md`, so patching the four generated files would be undone by
         the `rules:generate` this script runs moments later. */
      what: 'drop the salesforce-locators deferral from the add-page-object prompt',
      find: `from \\\`PROJECT.md\\\`; on a Salesforce org it defers to \\\`salesforce-locators\\\`).`,
      replace: `from \\\`PROJECT.md\\\`).`,
    },
    {
      file: 'rules/tasks.ts',
      what: 'drop the salesforce-data alternative from the add-factory prompt',
      find: `Load the \\\`data-strategy\\\` skill (or \\\`salesforce-data\\\` for org records).`,
      replace: `Load the \\\`data-strategy\\\` skill.`,
    },
    {
      file: '.github/workflows/playwright.yml',
      /* THE BUG THIS FIXES: the pack removes the `salesforce-contract` JOB, but the `required`
         gate still listed it under `needs:`. GitHub Actions REFUSES to load a workflow whose
         `needs` names a job that does not exist — so the prune was silently producing a repo with
         no CI at all. None of the six gates could see it; only grepping the pruned tree for
         leftover references did. Hence the seventh gate below. */
      what: 'drop salesforce-contract from the required-checks needs list',
      find: '    needs: [quality, api, salesforce-contract, ui]',
      replace: '    needs: [quality, api, ui]',
    },
    {
      file: '.github/workflows/playwright.yml',
      what: 'drop the salesforce-contract result echo',
      find: '          echo "salesforce-contract=${{ needs.salesforce-contract.result }}"\n',
      replace: '',
    },
    {
      file: '.github/workflows/playwright.yml',
      what: 'drop salesforce-contract from the lane-failure loop',
      find: '          for result in "${{ needs.api.result }}" "${{ needs.ui.result }}" "${{ needs.salesforce-contract.result }}"; do',
      replace: '          for result in "${{ needs.api.result }}" "${{ needs.ui.result }}"; do',
    },
    {
      file: '.github/workflows/playwright.yml',
      what: 'drop the salesforce lanes from the header comment',
      find: `#   - salesforce-contract  : org metadata + permission model. No browser. Auto-skips unless
#                            SF_LOGIN_URL is set. Cheap enough to gate every push.
#   - ui                   : functional + e2e, sharded across runners, reports merged into one.
#
# The Salesforce UI lane is deliberately NOT here: it needs one org user per persona and a browser,
# so it belongs on a nightly/pre-release schedule rather than every push. Add it with
# \`--project=salesforce\` once the persona users exist. See docs/salesforce/TEST-ARCHITECTURE.md §6.`,
      replace:
        '#   - ui                   : functional + e2e, sharded across runners, reports merged into one.',
    },
    {
      file: 'CLAUDE.md',
      /* This paragraph explains rule #15 — which this pack DELETES from rules/constitution.ts.
         Leaving it would have CLAUDE.md justify a rule the generated table no longer lists. */
      what: 'remove the rule #15 rationale paragraph (the rule itself is being removed)',
      find: `Rule #15 is the Salesforce-specific sharpening of #4, and it earns its own row because Salesforce field
API names are **org state, not application source**. An admin can add, rename, or delete a field with no
deploy and no commit, so there is no repository to read them from — \`describe\` is the only source of
truth. \`Margin__c\` existing in someone else's org proves nothing about yours.

`,
      replace: '',
    },
    {
      file: '.github/instructions/waits.instructions.md',
      what: 'drop the Salesforce example from the networkidle note',
      find: 'Harmful on chatty SPAs (Salesforce especially) where the network',
      replace: 'Harmful on chatty SPAs where the network',
    },
    {
      file: '.github/instructions/pages-and-selectors.instructions.md',
      what: 'drop the salesforce row from the locator-priority list',
      find: '  - salesforce: `getByRole` → `getByLabel` → `getByText` → `getByTestId` (never Lightning hashed ids/classes)\n',
      replace: '',
    },
    {
      file: 'CLAUDE.md',
      what: 'drop salesforce from the §0 profile list',
      find: 'applies a profile (generic / controlled /\nsalesforce / api-only)',
      replace: 'applies a profile (generic / controlled /\napi-only)',
    },
    {
      file: 'CLAUDE.md',
      what: 'remove the §0 "load the salesforce skill" instruction (the skill is gone)',
      find: `
If the recorded profile is **\`salesforce\`**, also load the \`salesforce\` skill before doing anything
else Salesforce-specific — the pack (§7) replaces several generic defaults outright.
`,
      replace: '',
    },
    {
      file: 'CLAUDE.md',
      what: 'drop the salesforce row from the §6 profile table',
      find: '| `salesforce` | role → label → text → testId               | Full pack: extra skills + code. See §7. |\n',
      replace: '',
    },
    {
      file: 'CLAUDE.md',
      what: 'reword the TARGET-FIT pointer, which named a Salesforce org as a supported target',
      find: '`bootstrap` when the target is anything other than a web app or a Salesforce org.',
      replace: '`bootstrap` when the target is anything other than a web app.',
    },
    {
      file: '.github/copilot-instructions.md',
      what: 'drop salesforce from the Copilot profile list',
      find: '`controlled` / `salesforce` / `api-only`)',
      replace: '`controlled` / `api-only`)',
    },
    {
      file: 'docs/TARGET-FIT.md',
      what: 'drop the Salesforce-plus-web-app note',
      find: `
A Salesforce org **and** a custom web app in one suite is supported and not obvious: the two
project sets are gated by different env vars (\`SF_LOGIN_URL\` and \`TEST_USER_EMAIL\`), so they
coexist without interfering.
`,
      replace: '',
    },
    {
      file: 'docs/TARGET-FIT.md',
      /* Reworded, not deleted. The reasoning is sound without the pack; only the cross-reference
         dies with it. Deleting the bullet would lose a real decision. */
      what: 'reword the visual-regression rationale without the pack cross-reference',
      find: `- **No visual regression.** Deliberate — see the \`salesforce\` pack's reasoning: styling churns,
  and the scaffold already bans styling-based selectors for the same reason.
- **No \`@axe-core\` by default.** On a platform org you would mostly be auditing the vendor's
  components, not your own.`,
      replace: `- **No visual regression.** Deliberate: styling churns far faster than behaviour, and the
  scaffold already bans styling-based selectors for the same reason. A snapshot suite would be a
  treadmill.`,
    },
    {
      file: 'docs/TARGET-FIT.md',
      what: 'reword the chatty-SPA section, which cited Salesforce as the source of the lesson',
      find: `## 5. Heavy enterprise SPAs that are not Salesforce

Workday, SAP Fiori, ServiceNow, Dynamics and similar have no dedicated profile. Use \`generic\`, and
apply one Salesforce lesson to them: **treat Constitution #2 (\`networkidle\`) as a refusal, not a
warning.**`,
      replace: `## 5. Heavy enterprise SPAs

Workday, SAP Fiori, ServiceNow, Dynamics and similar have no dedicated profile. Use \`generic\`, and
**treat Constitution #2 (\`networkidle\`) as a refusal, not a warning.**`,
    },
    {
      file: 'profiles/generic.md',
      what: 'reword the chatty-SPA note, which cited Salesforce as the source of the lesson',
      find: `dedicated one. Apply one Salesforce lesson to them: **treat Constitution #2 as a refusal, not a
warning.**`,
      replace: `dedicated one. **Treat Constitution #2 as a refusal, not a warning.**`,
    },
    {
      file: 'profiles/generic.md',
      what: 'drop the Lightning comparison from the markup-churn note',
      find: "`helpers/util/network.ts` and pre-register the specific gating response. Their generated markup\nchurns like Lightning's too, so prefer role and label engines over anything structural.",
      replace:
        '`helpers/util/network.ts` and pre-register the specific gating response. Their generated markup\nchurns just as fast, so prefer role and label engines over anything structural.',
    },
    {
      file: 'fixtures/test-options.ts',
      what: 'correct the docblock (it describes fixtures this prune removes)',
      find: ` *
 * The Salesforce fixtures (\`org\`, \`orgAs\`, \`orgSession\`, \`asPersona\`) are merged in here too and
 * cost nothing when unused: Playwright fixtures are LAZY, so their setup only runs for a test that
 * actually destructures them, and \`config/salesforce.config.ts\` reads env vars through getters. So
 * a non-Salesforce project needs no SF_* variables set. \`bootstrap\` prunes them for other profiles.
`,
      replace: '',
    },
    {
      file: 'config/app.config.ts',
      what: 'drop the dangling salesforceConfig cross-reference',
      find: 'Namespaced by environment (`.auth/<env>/user.json`), matching `salesforceConfig.storageStateFor`.',
      replace: 'Namespaced by environment (`.auth/<env>/user.json`).',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'drop salesforce from the profile list',
      find: '`generic` | `controlled` | `salesforce` | `api-only`',
      replace: '`generic` | `controlled` | `api-only`',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'drop Salesforce from the app-type interview question',
      find: '2. **App type?** generic web app / an app we control the source of / Salesforce (or other heavy SPA).',
      replace: '2. **App type?** generic web app / an app we control the source of / a heavy SPA.',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'drop the now-dangling "not Salesforce" bullet from Phase 4',
      find: '  - **not Salesforce** → nothing to do (see Phase 3).\n',
      replace: '',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'drop Salesforce from the skill description frontmatter',
      find: 'applies a profile (generic/controlled/salesforce/api-only)',
      replace: 'applies a profile (generic/controlled/api-only)',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'drop the Salesforce aside from the Phase 5 PROJECT.md guidance',
      find: 'flaky areas, iframe/shadow-DOM notes for Salesforce). This file overrides',
      replace: 'flaky areas). This file overrides',
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
  ],
  blockEdits: [
    {
      file: 'PROJECT.md.template',
      what: 'remove the Salesforce-pack and FSC decision fields',
      start: '- **Salesforce pack:**',
      end: '- **Tech stack (under test):**',
    },
    {
      file: 'PROJECT.md.template',
      what: 'remove the whole Salesforce section of the template',
      start: '## Salesforce (delete this whole section if the profile is not `salesforce`)',
      end: 'END_OF_FILE',
    },
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
    {
      /* bootstrap is the skill a fresh clone loads FIRST. Leaving it offering `npm run prune`
         after this pack has deleted that script is exactly the stale-reference failure this
         whole script exists to prevent — so the prune offer, the tier table and the entire
         Salesforce sub-phase go with the pack. */
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'remove the prune offer, the tier table and Phase 3b (Salesforce bootstrap)',
      start: "### The Salesforce pack is an OPT-IN OVERLAY — and removing it is the user's call",
      end: '## Phase 4 — Apply the profile',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: "remove the Salesforce lines from the Don't list",
      start: "- Don't prune the Salesforce pack **by hand or from a checklist**",
      end: 'END_OF_FILE',
    },
  ],
  regexEdits: [
    {
      file: 'docs/TARGET-FIT.md',
      /* A regex because the `salesforce-fsc` pack may already have removed ONE of these rows, and
         a literal listing all three would then miss — turning a legal compose order into a fatal
         anchor failure. Matching the contiguous run of `| Salesforce…` rows works for three rows
         or two. Non-global on purpose: one match covers the whole run, and a /g regex would carry
         `lastIndex` state between the validation pass and the apply pass. */
      what: 'drop the Salesforce rows from the good-fit table',
      pattern: /(?:^\| Salesforce.*\n)+/m,
      replace: '',
    },
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
      pattern: /\/\*\*\n \* [=═]+\n \* THE OVERLAY IS CONDITIONAL[\s\S]*?\n \*\/\n/,
      replace: '',
    },
    {
      file: 'scripts/generate-rule-surfaces.ts',
      what: "drop 'salesforce' from the generated TOPICS list",
      pattern: /\n {2}'salesforce',(?=\n\];)/,
      replace: '',
    },
    // Rule #15 ("a Salesforce object or field API name written from memory") is the only
    // profile-gated rule, and it is unsatisfiable once `describe` is no longer reachable.
    dropRuleById(15),
  ],
  dropScripts: [
    'sf:schemas',
    'sf:visible-fields',
    'test:contract',
    'test:personas',
    'test:salesforce',
    // Removes itself: once the pack is gone there is nothing left to prune, and leaving the script
    // in place invites someone to run it against a repo it no longer understands.
    'prune',
  ],
  dropRuleIds: [15],
  deletesThisScript: true,
  refuse: async ({ projectMd }) => {
    if (projectMd !== null && /profile.*salesforce/i.test(projectMd)) {
      return (
        'PROJECT.md records the `salesforce` profile. Refusing to remove the pack this project ' +
        'depends on. If the profile is wrong, fix PROJECT.md first.'
      );
    }
    return null;
  },
  manualFollowUps:
    'Salesforce mentions in README.md, AI-WORKFLOWS.md and docs/MAINTAINING-THE-AI-LAYER.md;\n' +
    '    the one-line "load salesforce-X instead" guards in six generic skill descriptions; and\n' +
    '    a handful of docblocks that cite the profile as an EXAMPLE and stay true either way\n' +
    '    (helpers/util/network.ts, pages/base.page.ts, fixtures/api/api-request.ts, rules/tasks.ts).\n' +
    '    Deliberately not scripted: markdown surgery on hand-written prose is fragile and the\n' +
    '    remaining token win is small. The docblocks that would become FALSE — test-options.ts\n' +
    '    and app.config.ts — are scripted above, because a wrong comment is worse than a stale one.',
};

// -- pack: salesforce-fsc (tier 3 only) -------------------------------------------------------

const SALESFORCE_FSC: Pack = {
  id: 'salesforce-fsc',
  title: 'the Financial Services Cloud tier',
  summary: 'tier 3 only — keeps all of core Salesforce, drops the FSC-specific skill and routing',
  worth:
    '~97 always-loaded tokens (one skill description) plus an 87-line skill. That is small,\n' +
    '    and it is not the point: the point is that a non-FSC org can say so and have the\n' +
    '    retrieval index agree. Person Accounts and managed-package namespace resolution are\n' +
    '    tier 2 and SURVIVE this prune — they were never FSC-specific.',
  deletePaths: ['.claude/skills/salesforce-fsc'],
  edits: [
    {
      file: 'CLAUDE.md',
      what: 'drop the FSC row from the §4 Salesforce routing table',
      find:
        '| Test Financial Services Cloud specifically          | `salesforce-fsc`               |' +
        ' `salesforce-data`, `salesforce-async` |\n',
      replace: '',
    },
    {
      file: 'CLAUDE.md',
      what: 'drop the §7 second-tier sentence',
      find:
        '**`docs/salesforce/TEST-ARCHITECTURE.md`** and the `salesforce` skill. Financial Services' +
        ' Cloud adds\na second tier (`salesforce-fsc`), loaded only when `PROJECT.md` records it.',
      replace: '**`docs/salesforce/TEST-ARCHITECTURE.md`** and the `salesforce` skill.',
    },
    {
      file: 'README.md',
      what: 'drop the second-tier clause from the skill-pack paragraph',
      find:
        '`salesforce-personas`, `salesforce-metadata-contract`, `salesforce-data` — plus' +
        ' `salesforce-fsc`\nas a second-tier overlay, added only for Financial Services Cloud orgs' +
        ' so nobody else pays for it.',
      replace: '`salesforce-personas`, `salesforce-metadata-contract`, `salesforce-data`.',
    },
    {
      file: 'docs/TARGET-FIT.md',
      what: 'drop the FSC row from the good-fit table',
      find: `| Salesforce Financial Services Cloud     | \`salesforce\` | Tier 2 **plus** \`salesforce-fsc\`. Record \`fsc: true\` in \`PROJECT.md\`.                       |
`,
      replace: '',
    },
    {
      file: 'profiles/salesforce.md',
      what: 'drop the FSC row from the skills table',
      find:
        '| `salesforce-fsc`               | FSC only (second-tier overlay): `FinServ__`, households,' +
        ' reciprocal roles    |\n',
      replace: '',
    },
    {
      file: '.claude/skills/salesforce-metadata-contract/SKILL.md',
      /* The managed-package section stays — it serves nCino, Vlocity, Veeva and Conga, none of
         which care about FSC. Only the "why FSC has its own skill" aside dies with tier 3. */
      what: 'drop the FSC aside from the managed-package section',
      find: `
> FSC has its own skill (\`salesforce-fsc\`) only because its _data model_ — households, reciprocal
> roles, \`FinServ__\` objects — needs naming. Everything in THIS section applies to every package,
> FSC included. If you are on nCino or Vlocity, this section is your equivalent, and there is no
> tier-3 skill to go looking for.
`,
      replace: '',
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      /* Replaced, not deleted. The Person Accounts half of this item MUST survive — it is the
         thing most often mistaken for an FSC question, and getting it wrong means a B2C org
         never gets asked. Replacing also keeps the ordered list's numbering intact, which
         deleting item 3 would not. */
      what: 'replace the Phase 3b FSC question with the Person Accounts question it carried',
      find: `3. **Financial Services Cloud?** Ask explicitly. If yes, route to \`salesforce-fsc\` for the
   \`FinServ__\` data model, householding roll-ups and reciprocal roles, and record \`fsc: true\` in
   \`PROJECT.md\`. If no, do not load it — it is a second-tier overlay and irrelevant elsewhere.
   Person Accounts are NOT an FSC question: any B2C org can have them enabled, and they live in
   \`salesforce-data\`. Ask whether the org uses them regardless of the FSC answer.`,
      replace: `3. **Person Accounts?** Ask explicitly — any B2C org can have them enabled (retail,
   nonprofit, healthcare), and they change the shape of "create an Account" completely: one record
   that is both Account and Contact, a computed \`Name\`, and a record type that must be pinned. See
   \`salesforce-data\`. Record the answer in \`PROJECT.md\`.`,
    },
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: "drop the two FSC lines from the Don't list",
      find: `- Don't prune \`salesforce\` before \`salesforce-fsc\`. Tier 2 deletes the files tier 3 edits, so the
  reverse order is refused.
- Don't load \`salesforce-fsc\` unless the user confirmed Financial Services Cloud.
`,
      replace: '',
    },
  ],
  blockEdits: [
    {
      file: '.claude/skills/bootstrap/SKILL.md',
      what: 'remove the two-tier table and the tier-3 question guidance',
      start: '### Two tiers, so nobody pays for what they do not use',
      end: '**If the profile IS `salesforce`, go to Phase 3b instead of Phase 4.**',
    },
    {
      file: 'profiles/salesforce.md',
      what: 'remove the "You do not need FSC" section (there is no longer an FSC tier to disclaim)',
      start: '### You do not need FSC',
      end: '## Locator priority',
    },
  ],
  regexEdits: [],
  dropScripts: [],
  dropRuleIds: [],
  deletesThisScript: false,
  refuse: async ({ projectMd, exists }) => {
    if (projectMd !== null && /fsc:\s*true/i.test(projectMd)) {
      return (
        'PROJECT.md records `fsc: true`. Refusing to remove the tier this project depends on. ' +
        'If that is wrong, fix PROJECT.md first.'
      );
    }
    if (!(await exists('.claude/skills/salesforce'))) {
      return (
        'The Salesforce pack (tier 2) is already gone, so there is no tier 3 to remove — and the ' +
        'files this pack edits went with it. Prune `salesforce-fsc` BEFORE `salesforce`, never ' +
        'after.'
      );
    }
    return null;
  },
  manualFollowUps:
    'None scripted. `salesforce-data` still names Financial Services as one example of a B2C\n' +
    '    org with Person Accounts, which stays accurate whether or not the org runs FSC.',
};

const PACKS: readonly Pack[] = [SALESFORCE_FSC, SALESFORCE];

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

/**
 * Seventh gate: every `needs:` entry in the CI workflow names a job that exists.
 *
 * The other six gates run Node tooling and are blind to YAML. That blindness shipped a real bug —
 * the salesforce pack removed the `salesforce-contract` JOB while the `required` gate still listed
 * it under `needs:`, and GitHub Actions refuses to load such a workflow. The prune therefore left
 * a repo with NO CI while reporting six green gates. Cheap structural check, no yaml dependency.
 */
async function workflowJobsResolve(): Promise<string | null> {
  const rel = '.github/workflows/playwright.yml';
  if (!(await exists(rel))) return null;
  const source = await fs.readFile(path.resolve(ROOT, rel), 'utf8');
  const jobsAt = source.indexOf('\njobs:');
  if (jobsAt === -1) return null;
  const body = source.slice(jobsAt);
  const defined = new Set([...body.matchAll(/^ {2}([A-Za-z0-9_-]+):$/gm)].map((m) => m[1]!));
  const missing: string[] = [];
  for (const m of body.matchAll(/^\s*needs:\s*(.+)$/gm)) {
    const raw = m[1]!.trim();
    const names = raw.startsWith('[') ? raw.replace(/[[\]]/g, '').split(',') : [raw];
    for (const n of names.map((x) => x.trim()).filter(Boolean)) {
      if (!defined.has(n) && !missing.includes(n)) missing.push(n);
    }
  }
  return missing.length > 0
    ? `${rel}: needs → ${missing.join(', ')} — no such job. GitHub Actions will refuse to load this workflow.`
    : null;
}

async function readProjectMd(): Promise<string | null> {
  return fs.readFile(path.resolve(ROOT, 'PROJECT.md'), 'utf8').catch(() => null);
}

// -- pack selection ---------------------------------------------------------------------------

/**
 * With no `--pack`, this lists rather than guesses. Choosing for the user is exactly the mistake
 * the old mandatory prune made: a prune is a large, opinionated deletion and the decision is
 * theirs (Constitution #4's spirit). `bootstrap` OFFERS it; nothing applies it silently.
 */
async function listPacks(projectMd: string | null): Promise<void> {
  console.log('  Packs you can remove\n  ====================\n');
  for (const pack of PACKS) {
    const installed = await exists(pack.deletePaths[0]!);
    const refusal = installed ? await pack.refuse({ projectMd, exists }) : null;
    const state = !installed ? 'already absent' : (refusal ?? 'available');
    console.log(`  --pack=${pack.id}`);
    console.log(`      ${pack.summary}`);
    console.log(`      status: ${state}`);
    console.log(`      worth:  ${pack.worth.trim()}\n`);
  }
  console.log(
    '  Order matters: prune `salesforce-fsc` before `salesforce`, never after — tier 2 deletes\n' +
      '  the files tier 3 edits.\n\n' +
      '  Run `npm run prune -- --pack=<id>` for a dry run, then add `--yes` to apply.\n',
  );
}

function selectPack(): Pack {
  const pack = PACKS.find((p) => p.id === PACK_ARG);
  if (pack === undefined) {
    throw new PruneError(
      `Unknown pack "${PACK_ARG}". Known packs: ${PACKS.map((p) => p.id).join(', ')}.`,
    );
  }
  return pack;
}

// -- safety gates -----------------------------------------------------------------------------

async function assertSafe(pack: Pack, projectMd: string | null): Promise<void> {
  const refusal = await pack.refuse({ projectMd, exists });
  if (refusal !== null) throw new PruneError(refusal);

  if (projectMd === null) {
    console.log(
      '  WARNING: no PROJECT.md - the scaffold has not been bootstrapped yet. Pruning is safe,\n' +
        '  but run `bootstrap` first so the profile decision is recorded before deleting anything.\n',
    );
  }

  // Require a clean tree, so the prune is one revertable commit.
  if (APPLY && git('status', '--porcelain') !== '') {
    throw new PruneError(
      'Working tree is not clean. A prune touches code, CI and the AI layer together, so it ' +
        'must land as ONE reviewable commit you can `git revert`. Commit or stash first.',
    );
  }
}

// -- plan / apply -----------------------------------------------------------------------------

async function prune(pack: Pack, projectMd: string | null): Promise<void> {
  console.log(`\n  Removing ${pack.title} (--pack=${pack.id})\n  ${'='.repeat(30)}\n`);
  await assertSafe(pack, projectMd);

  const present: string[] = [];
  const already: string[] = [];
  for (const rel of pack.deletePaths) {
    ((await exists(rel)) ? present : already).push(rel);
  }

  if (present.length === 0) {
    console.log(`  Nothing to do - ${pack.title} is already absent.\n`);
    return;
  }

  console.log(`  Delete (${present.length}):`);
  for (const rel of present) console.log(`    -  ${rel}`);
  if (already.length > 0) console.log(`  (${already.length} path(s) already absent)`);

  const anchoredEdits = pack.edits.length + pack.blockEdits.length + pack.regexEdits.length;
  const scriptEdit = pack.dropScripts.length > 0 ? 1 : 0;
  console.log(`\n  Edit (${anchoredEdits + scriptEdit}):`);
  for (const edit of pack.edits) console.log(`    ~  ${edit.file} - ${edit.what}`);
  for (const edit of pack.blockEdits) console.log(`    ~  ${edit.file} - ${edit.what}`);
  for (const edit of pack.regexEdits) console.log(`    ~  ${edit.file} - ${edit.what}`);
  if (scriptEdit === 1) {
    console.log(`    ~  package.json - drop scripts: ${pack.dropScripts.join(', ')}`);
  }

  console.log('\n  Then: regenerate the rule surfaces, and verify with all six gates.');
  console.log(`\n  Left for you: ${pack.manualFollowUps}`);

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
    ...pack.edits.map((e) => e.file),
    ...pack.blockEdits.map((e) => e.file),
    ...pack.regexEdits.map((e) => e.file),
  ]);
  for (const rel of involved) {
    files.set(rel, await fs.readFile(path.resolve(ROOT, rel), 'utf8'));
  }

  const problems: string[] = [];
  for (const edit of pack.edits) {
    if (!files.get(edit.file)!.includes(edit.find)) {
      problems.push(`${edit.file}: literal anchor missing - ${edit.what}`);
    }
  }
  for (const edit of pack.blockEdits) {
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
  for (const edit of pack.regexEdits) {
    if (!edit.pattern.test(files.get(edit.file)!)) {
      problems.push(`${edit.file}: pattern ${String(edit.pattern)} missing - ${edit.what}`);
    }
  }

  if (problems.length > 0) {
    throw new PruneError(
      `${problems.length} anchor(s) no longer match the code:\n` +
        problems.map((p) => `      - ${p}`).join('\n') +
        '\n\n    NOTHING has been changed - this was checked before any write.\n' +
        '    Fix the anchors in scripts/prune.ts rather than pruning by hand: a partial prune\n' +
        '    that reports success is the exact failure this script exists to stop.',
    );
  }
  console.log(`    all ${anchoredEdits} anchors matched`);

  // Phase 2: transform in memory, then write once per file.
  console.log('\n  Applying...');
  for (const edit of pack.edits) {
    files.set(edit.file, files.get(edit.file)!.replace(edit.find, edit.replace));
  }
  for (const edit of pack.blockEdits) {
    const source = files.get(edit.file)!;
    const from = source.indexOf(edit.start);
    const to =
      edit.end === 'END_OF_FILE'
        ? source.length
        : source.indexOf(edit.end, from + edit.start.length);
    files.set(edit.file, `${source.slice(0, from)}${source.slice(to)}`);
  }
  for (const edit of pack.regexEdits) {
    files.set(edit.file, files.get(edit.file)!.replace(edit.pattern, edit.replace));
  }
  for (const [rel, content] of files) {
    await fs.writeFile(path.resolve(ROOT, rel), content, 'utf8');
  }

  // package.json scripts
  if (pack.dropScripts.length > 0) {
    const pkgPath = path.resolve(ROOT, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const name of pack.dropScripts) delete pkg.scripts[name];
    await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }

  // Deletions last, so an anchor failure above leaves the files intact.
  for (const rel of present) {
    await fs.rm(path.resolve(ROOT, rel), { recursive: true, force: true });
  }
  /* And finally this script itself, for the pack that owns it. After the tier-2 prune there is
     nothing left to prune, and this file is the last thing in the repo that mentions Salesforce —
     keeping it would leave dead code that lint still has to check and that invites someone to run
     it against a repo it no longer describes. It is recoverable from git history like anything
     else. */
  if (pack.deletesThisScript) {
    await fs.rm(path.resolve(ROOT, 'scripts/prune.ts'), { force: true });
  }
  console.log(`    removed ${present.length} path(s), applied every edit`);

  // Regenerate, then format - the generator writes markdown that must satisfy prettier --check.
  if (
    pack.dropRuleIds.length > 0 ||
    pack.regexEdits.some((e) => e.file === 'rules/constitution.ts')
  ) {
    console.log('\n  Regenerating rule surfaces...');
    execFileSync('npx', ['tsx', 'scripts/generate-rule-surfaces.ts'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
  }
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

  const failed: (readonly [string, string, readonly string[]])[] = gates.filter(
    ([label, cmd, args]) => !run(label, cmd, [...args]),
  );

  const workflowProblem = await workflowJobsResolve();
  if (workflowProblem === null) {
    console.log('    PASS  workflow job graph');
  } else {
    console.log(`    FAIL  workflow job graph — ${workflowProblem}`);
    failed.push(['workflow job graph', '', []]);
  }

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
      `      git add -A && git commit -m "Remove ${pack.title}"\n\n` +
      '  Then record the decision in PROJECT.md so a later session does not re-offer it.\n',
  );
}

async function main(): Promise<void> {
  const projectMd = await readProjectMd();
  if (PACK_ARG === undefined) {
    console.log('');
    await listPacks(projectMd);
    return;
  }
  await prune(selectPack(), projectMd);
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
