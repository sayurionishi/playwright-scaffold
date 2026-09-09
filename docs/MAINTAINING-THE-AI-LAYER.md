# Maintaining the AI layer

This scaffold's rules are code. They are generated, linted, and gated in CI like anything else, and
they need the same maintenance discipline. This is that discipline.

## The one-minute version

```
Rules live in       rules/constitution.ts        (15 hard stops + how each is enforced)
Task prompts in     rules/tasks.ts               (/add-spec, /architect-review, …)
Knowledge lives in  .claude/skills/<name>/       (one skill per topic, loaded on demand)

Change a rule   →  edit rules/constitution.ts, run `npm run rules:generate`, commit both
Change a skill  →  edit the SKILL.md; nothing to regenerate
Check it        →  `npm run rules:check` (also runs in CI)
```

Nine of the surfaces are **generated**: `CLAUDE.md` §1, `.github/copilot-instructions.md`, the five
path-scoped `.github/instructions/*` files, `AGENTS.md`, and `docs/PARITY-MATRIX.md`. Editing a
generated block by hand fails CI, on purpose.

## Why it is generated

The same rules used to be maintained by hand in four places, and they had already drifted: the
Copilot copy listed **14 of the 15** rules — rule #15 was simply absent — and rule #2 had lost the
clause making `networkidle` a hard refusal on the Salesforce profile. Nothing detected either,
because nothing tied the copies together. The team using this scaffold was working from a fifth of
the rules and did not know it.

One source plus a CI check makes that failure impossible rather than unlikely.

## Rules for writing rules

**Only encode what you would block a PR for.** A rule that is advice-in-disguise trains people to
skim the list. If you would merge the PR anyway, it belongs in a skill as guidance, not in the
Constitution as a hard stop.

**Prefer a real example over prose.** `❌ page.waitForTimeout(5000)` next to
`✅ await expect(saveButton).toBeEnabled()` teaches faster than a paragraph, and it survives being
skim-read. The false-green catalogue in `wait-strategy` and `salesforce-personas` is the model:
every entry is a concrete assertion that passes when it should fail.

**Write rules as "instead of X, do Y".** A prohibition with no alternative gets worked around. This
is not theoretical: `wait-strategy` banned `waitForTimeout` while its hierarchy stopped at "wait for
a response" and "wait for an element" — so for anything that settles asynchronously the only path it
offered was the one thing it forbade. People used the sleep, correctly concluding the rules had no
answer. Adding `expect.poll` fixed the rule, not the people.

**When the model keeps making the same mistake, fix the RULE.** Repeatedly correcting the same
output is a bug report about the instruction. Two of the violations in this repo's own history were
rules that could not be obeyed: #10 (`new SomePage(page)`) was broken three times in the flagship
spec because no fixture existed to consume, and #9 (raw locators in a spec) was broken in the e2e
journey because the page objects it needed had never been written. Enforcing them surfaced the
missing affordance in minutes.

**When a rule and the code disagree, that is a bug — and the rule usually wins.** But not always:
`test-standards` demonstrated `page.getByText(...)` in a spec while the Constitution said locators
live in page objects only. The example was wrong and got fixed. Decide which is right; do not leave
them contradicting each other, because a reader who spots the contradiction stops trusting both.

**Never claim enforcement you do not have.** A false claim is worse than no claim, because it stops
both humans and models from checking. `CLAUDE.md` used to assert "a hook (ESLint) enforces #1, #2,
#5" and was wrong three ways: there was no hook, #1 was scoped to spec files only, and #2 was a
non-blocking warning. `docs/PARITY-MATRIX.md` is now generated from each rule's `enforcement` field
precisely so it cannot overclaim — to make a row say blocking, you have to make the rule blocking.

## Rules for writing skill descriptions

The `description` is the whole retrieval surface. The body is irrelevant if the description never
matches.

**Use the words a user would type**, including error strings: "strict-mode violation",
"locator not found", "flaky". Not "concepts relating to element identification".

**State a machine-checkable precondition when there is one.** `bootstrap` is the model:
_"Use as the FIRST thing on a fresh clone (when PROJECT.md does not exist)"_. There is no judgement
call left.

**Never use a negative condition.** `common-tasks` used to say "when no other skill obviously
matches" — unevaluable at match time, since matching is what is being decided. It either never
fired or fired alongside the right skill and wasted a load.

**Guard a generic skill against its specialist.** Four pairs here collide on the same trigger words
(`selectors`/`salesforce-locators` on "strict-mode", `data-strategy`/`salesforce-data` on "test
data", and three skills on "flaky"). The generic member's description must say
_"for a Salesforce org, load X instead"_. Only `wait-strategy` did this originally; it is now the
pattern for all of them.

## Rules for `applyTo` globs

Copilot loads a `.github/instructions/*` file when the edited path matches its `applyTo`. Keep them
**specific**, and understand that a rule's scope is not a file's scope.

Deriving `applyTo` from the union of its rules' globs seems obvious and is wrong: rule #5 (`any`)
applies to `**/*.ts`, so the union made `api-and-security.instructions.md` load on every TypeScript
edit — a file about API contracts firing while you edit a page object. Repo-wide rules belong in
`copilot-instructions.md`, which loads for every request anyway. `TOPIC_SCOPES` in
`rules/constitution.ts` therefore declares each file's scope by hand, and `rules:generate` reports
rules that reach beyond it instead of silently widening the glob.

Some overlap is correct: a spec genuinely needs both the spec rules and the wait rules. What to
avoid is a file so broad it always fires.

## Keeping the reference implementation honest

The example specs and page objects are what everything else gets copied from, so they have to obey
the rules they demonstrate. Two traps:

- **Do not let them fall out of the lint globs.** If you move the examples to `examples/`, add that
  path to `ignores` in `eslint.config.mjs` or to the Playwright rule globs. Otherwise the file
  people copy from becomes the least-checked code in the repo.
- **Re-read them after changing a rule.** When #9 tightened to include `page.getBy*`, the e2e
  journey stopped complying and needed two new page objects. That is the rule working — but only
  because the examples are inside the gate.

## When you add a rule

1. Add it to `rules/constitution.ts`, with an honest `enforcement` value.
2. If it is mechanizable, mechanize it — usually a `no-restricted-syntax` entry whose message cites
   the rule number. A local ESLint plugin is almost never needed.
3. **Prove it fires.** Write the violation, watch lint fail, delete it. Every blocking row in the
   parity matrix in this repo was verified that way; a check nobody has seen fail is not a check.
4. `npm run rules:generate`, then commit the source and the regenerated surfaces together.
