/**
 * TASK PROMPTS — the repeatable jobs, defined once and generated into both tool surfaces.
 *
 * Claude Code reads slash commands from `.claude/commands/<name>.md`; Copilot reads prompt files
 * from `.github/prompts/<name>.prompt.md`. Same content, two formats — so like the Constitution
 * itself (see `rules/constitution.ts`), the text lives here once and
 * `scripts/generate-rule-surfaces.ts` writes both. Hand-writing them twice is how the instruction
 * files drifted in the first place.
 *
 * ── WHAT BELONGS HERE ─────────────────────────────────────────────────────────────────────────
 * A TASK: something with a beginning and an end that someone does repeatedly, where the value is
 * in not forgetting a step. "Add a spec", "review this diff against the standards".
 *
 * ── WHAT DOES NOT ─────────────────────────────────────────────────────────────────────────────
 * KNOWLEDGE. How to choose a locator, why networkidle is unusable on an SPA, what the persona
 * lattice is for — that is a skill, loaded on demand by description. A task prompt that explains
 * things is a skill in the wrong place, and it will drift from the skill that owns the topic.
 * Keep these thin: state the steps, and point at the skill for the reasoning.
 */

export interface TaskPrompt {
  /** File name and command name, e.g. 'add-spec' → `/add-spec`. */
  name: string;
  /** One line, shown in the command picker and the Copilot prompt list. */
  description: string;
  /**
   * Free-form inputs the prompt asks for. Rendered as `${input:<key>:<placeholder>}` for Copilot
   * and as plain guidance for Claude, which asks conversationally instead.
   */
  inputs?: ReadonlyArray<{ key: string; placeholder: string }>;
  /** The prompt body. Markdown. Reference skills by name; do not restate their content. */
  body: string;
}

export const TASK_PROMPTS: readonly TaskPrompt[] = [
  {
    name: 'add-spec',
    description: 'Add a Playwright spec for a feature, following this scaffold’s standards.',
    inputs: [
      { key: 'feature', placeholder: 'the feature or endpoint to cover' },
      { key: 'layer', placeholder: 'functional | e2e | api' },
    ],
    body: `Add a spec covering **\${input:feature}** at the **\${input:layer}** layer.

Load the \`test-standards\` skill first, and \`api-testing\` if the layer is \`api\`.

Work in this order, and stop to ask rather than guessing at step 2:

1. **Pick the layer deliberately.** Folder = project = system under test. \`functional\` is one
   screen, \`e2e\` is one whole journey (one test, not one per step), \`api\` is the backend as SUT.
   If the request spans layers, say so and propose the split before writing anything.
2. **Explore, do not invent.** Read the live app or the OpenAPI document for every selector, route,
   endpoint and user-facing string. Constitution #4 forbids guessing any of them — if you cannot
   reach the source, ASK. This is the step where confidence is either earned or faked.
3. **Locators go in a page object**, never in the spec (#9), and it is consumed via its fixture,
   never constructed with \`new\` (#10). If the page object does not exist yet, that is a separate
   \`/add-page-object\` job — propose it rather than inlining locators "just this once".
4. **Exactly one tag** (#14), via the option form: \`test('…', { tag: '@smoke' }, …)\`. Add
   \`annotation\` for a ticket if there is one.
5. **Data:** happy-path values from a Faker factory, invalid/boundary values from
   \`test-data/static/\`. Never a \`.json\` file (#12).
6. **Waits:** a pre-registered response wait or a web-first assertion. \`expect.poll\` for anything
   that settles asynchronously. Never a sleep (#1).
7. **Verify:** \`npm run lint && npm run typecheck\`, then run the new spec — the file only, never
   the whole suite. Report what you ran and what it said.`,
  },
  {
    name: 'add-page-object',
    description:
      'Add or extend a page object for a screen, with locators on top and no assertions.',
    inputs: [{ key: 'screen', placeholder: 'the screen or component' }],
    body: `Add or extend the page object for **\${input:screen}**.

Load the \`page-objects\` skill, and \`selectors\` for locator priority (it reads the active profile
from \`PROJECT.md\`; on a Salesforce org it defers to \`salesforce-locators\`).

1. **Explore the real markup first.** Do not guess a selector (#4).
2. **Locators on top**, as class fields: \`readonly\` when a spec asserts on it, \`private readonly\`
   when it is internal. Never declared inline inside a method.
3. **Actions only. No assertions** (#8) — this is lint-enforced in \`pages/\`. Return the locator and
   let the spec assert on it. If you find yourself wanting \`expect\` here, the method is doing the
   spec's job.
4. **No fragile selectors** (#3): no CSS class, id, XPath or nth-child. Also lint-enforced.
5. **Register it** in \`fixtures/pom/page-object-fixture.ts\` so specs consume it by destructuring.
6. Extract a component object once the same widget appears in a third place — not before.
7. Verify with \`npm run lint && npm run typecheck\`.`,
  },
  {
    name: 'add-factory',
    description: 'Add a test-data factory or curated invalid-input set.',
    inputs: [{ key: 'entity', placeholder: 'the entity or payload' }],
    body: `Add test data for **\${input:entity}**.

Load the \`data-strategy\` skill (or \`salesforce-data\` for org records).

First decide WHICH KIND, because they live in different places and mixing them is the usual mistake:

- **Dynamic happy-path values** → a Faker factory in \`test-data/factories/\`. Takes
  \`(overrides, seed?)\`, spreads \`overrides\` last, and gets its generator from \`fakerFor(seed)\` —
  never \`faker.seed()\` directly, which mutates a module-global and de-randomises every later test
  in the worker.
- **Curated invalid / boundary inputs** → \`test-data/static/\`, \`as const\`. These are chosen
  values, not random ones; randomness would make a negative test non-reproducible.

Then:

1. \`.ts\` with \`as const\` — never \`.json\` (#12, guard-script enforced).
2. Unique values where a uniqueness constraint or a duplicate rule exists.
3. Export a type alongside the data, so a consuming spec stays typed.
4. Verify with \`npm run lint && npm run typecheck && npm run guard\`.`,
  },
  {
    name: 'architect-review',
    description:
      'Review a diff against this scaffold’s standards, focusing on what tools cannot catch.',
    body: `Review the current diff as a test-automation architect.

**Skip what tooling already covers.** \`npm run lint\` blocks 12 of the 15 Constitution rules and
\`npm run guard\` covers another; re-checking those by eye is wasted effort. Run them first, then
review only what they cannot see. \`docs/PARITY-MATRIX.md\` is the authoritative list.

Focus on the four things that are review-only, in this order:

1. **Invented values (#4 — unmechanizable).** Every selector, URL, endpoint, enum value and
   user-facing string: was it READ from the live app, an OpenAPI document, or \`describe\` — or
   written from memory because it looked right? This is the finding that propagates, because the
   next test copies it.
2. **Assertions that cannot fail.** The highest-value review skill in this repo:
   - \`toBeHidden()\` / \`toBeVisible()\` on a locator that matches ZERO elements — passes for a
     typo exactly as it passes for correct behaviour. Is there a positive control?
   - Asserting a status that \`expectStatus\` already enforced.
   - Asserting the container ("the table is visible") when the claim is about a row.
   - A derived value read straight off a write response, before it has settled.
3. **Wrong layer.** Field metadata or a permission matrix asserted through the UI when the API
   answers it in one call and says which of FLS / layout / record type was the cause. Or an e2e
   test doing a functional test's job.
4. **Over-abstraction.** A component object extracted on first use, a helper fixture wrapping a
   single call, a factory for one literal. The scaffold's own rule is the third occurrence.

Also check: does the test still fail if the feature breaks? Mutate the expectation mentally and see.

Report findings most-severe first, each with the file, the concrete failure it permits, and the
smallest fix. Say plainly when you find nothing — a clean review is a real result.`,
  },
] as const;
