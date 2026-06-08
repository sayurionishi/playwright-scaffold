# Profile: controlled

For an app whose source you control — you can add `data-testid` to components.

- **Locator priority:** **`getByTestId`** → `getByRole` → `getByLabel` → `getByText`.
  testId is first because you can add stable, intent-revealing ids and they're immune to copy/markup changes.
- **Add testIds at the source:** `testId?: string` prop → `data-testid={testId}`. kebab-case, feature-prefixed, no state encoded.
- **Waits:** deterministic; prefer waiting on your own known API operations (you know the endpoint/op names). No `networkidle`.
- **Auth:** keep `setup`/`auth.setup.ts` if there's a login.
- **Projects:** `api` (great here — same-stack contract tests share types), `setup`, `functional`, `e2e`.
- **Notes:** flip the example `pages/login.page.ts` locators from `getByLabel`/`getByRole` to `getByTestId` once real testIds exist.
