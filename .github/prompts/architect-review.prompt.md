---
description: Review a diff against this scaffold’s standards, focusing on what tools cannot catch.
mode: agent
---

Review the current diff as a test-automation architect.

**Skip what tooling already covers.** `npm run lint` blocks 12 of the 15 Constitution rules and
`npm run guard` covers another; re-checking those by eye is wasted effort. Run them first, then
review only what they cannot see. `docs/PARITY-MATRIX.md` is the authoritative list.

Focus on the four things that are review-only, in this order:

1. **Invented values (#4 — unmechanizable).** Every selector, URL, endpoint, enum value and
   user-facing string: was it READ from the live app, an OpenAPI document, or `describe` — or
   written from memory because it looked right? This is the finding that propagates, because the
   next test copies it.
2. **Assertions that cannot fail.** The highest-value review skill in this repo:
   - `toBeHidden()` / `toBeVisible()` on a locator that matches ZERO elements — passes for a
     typo exactly as it passes for correct behaviour. Is there a positive control?
   - Asserting a status that `expectStatus` already enforced.
   - Asserting the container ("the table is visible") when the claim is about a row.
   - A derived value read straight off a write response, before it has settled.
3. **Wrong layer.** Field metadata or a permission matrix asserted through the UI when the API
   answers it in one call and says which of FLS / layout / record type was the cause. Or an e2e
   test doing a functional test's job.
4. **Over-abstraction.** A component object extracted on first use, a helper fixture wrapping a
   single call, a factory for one literal. The scaffold's own rule is the third occurrence.

Also check: does the test still fail if the feature breaks? Mutate the expectation mentally and see.

Report findings most-severe first, each with the file, the concrete failure it permits, and the
smallest fix. Say plainly when you find nothing — a clean review is a real result.
