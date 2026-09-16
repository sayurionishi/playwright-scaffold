## What changed

<!-- One or two sentences. What does this PR make possible that was not possible before? -->

## Why

<!-- The problem this solves. Link the issue or ticket if there is one. -->

## How it was verified

<!-- Delete what does not apply. "CI is green" is not verification on its own — CI auto-skips the
     test lanes when BASE_URL is unset, so a green check can mean no tests ran. -->

- [ ] `npm run typecheck`
- [ ] `npm run lint` (fails on warnings)
- [ ] `npm run guard` and `npm run rules:check`
- [ ] Ran the affected spec(s) against a real target — which, and the result:
- [ ] For a flake fix: ran the affected spec **5× consecutively green**

## Constitution

`docs/PARITY-MATRIX.md` records which rules are machine-enforced. The ones below are **not** — a
tool cannot catch them, so this is where a human has to look. Confirm or explain:

- [ ] **#4** No guessed selector, URL, endpoint, enum value, or UI string. Everything was read from
      the live app, an OpenAPI document, or `describe` — not from memory.
- [ ] **#7** Every API response this PR touches is validated against a Zod schema.
- [ ] **#13** No failure was silenced — no widened timeout, no loosened schema, no untracked skip.
      If a test is red because the product is wrong, that is a bug report, not a schema change.
- [ ] Any rule this PR deliberately breaks is called out below, with the reason.

## Notes for the reviewer

<!-- Anything you want a second opinion on, or a trade-off you made deliberately. -->
