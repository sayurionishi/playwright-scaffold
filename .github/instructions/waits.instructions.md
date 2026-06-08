---
applyTo: 'pages/**,helpers/**,tests/**'
---

# Wait strategy (mirror of `.claude/skills/wait-strategy`)

- **Never `page.waitForTimeout(ms)`** (banned). Use a web-first assertion or a response wait.
- **`networkidle`: discouraged, not banned.** Harmful on chatty SPAs (Salesforce especially) where the network never goes quiet → use a deterministic response wait there. Legitimately fine on static/SSR pages that settle; if kept, add a comment saying why the page goes quiet.
- **Pre-register before you trigger:** `page.waitForResponse` only catches responses arriving after the call. Create the promise BEFORE the click:
  ```ts
  const loaded = waitForRest(page, '/api/products'); // arm
  await button.click(); // trigger
  await loaded; // await
  ```
  Concurrent requests → arm both, then `Promise.all`.
- Use `helpers/util/network.ts` (`waitForRest`, `waitForGraphQL`).
- **Blur after fill** to commit a controlled-form dirty flag (`fillAndBlur` in `helpers/util/forms.ts`).
- **Loader trap:** CSS-module classes are hashed; `.loader` matches zero elements and `toBeHidden()` passes trivially. Use `[class*="loader"]` partial-match + `.first()`, or a `data-testid`.
