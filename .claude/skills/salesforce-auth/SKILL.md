---
name: salesforce-auth
description: Use when authenticating tests to a Salesforce org — JWT bearer flow, sf CLI tokens, injecting a session into the browser, handling mandatory MFA or SSO, and producing one storageState per persona. Load before writing any Salesforce UI test.
---

# Salesforce Auth — never automate the login form

Salesforce login is the single largest source of flake in Salesforce suites: it is slow, it is MFA-gated,
it may be SSO-redirected, and it rate-limits. The fix is to stop driving it. Mint a session over the API,
then hand that session to the browser.

## The model

```
1. JWT bearer flow (server-to-server)  →  access_token + instance_url
2. Inject that session into a browser context
3. Save storageState  →  every UI test starts logged in
```

Step 1 is **MFA-exempt by design** — the JWT bearer flow is an OAuth flow for trusted server-to-server
integration; there is no interactive challenge to satisfy. This is not a workaround, it is the supported
path for automation.

## Getting a session

`helpers/salesforce/auth.ts` implements three strategies. Pick by environment.

| Strategy   | Use for          | Needs                                                     |
| ---------- | ---------------- | --------------------------------------------------------- |
| `jwt`      | **CI** (default) | Connected App: consumer key + RSA private key + username  |
| `sfdx`     | Local dev        | `sf` CLI authenticated to the org; just an alias          |
| `password` | Last resort      | username + password + security token; **MFA must be off** |

`jwt` needs no new dependency — Node's built-in `crypto` signs the RS256 assertion.

### Setting up the Connected App (one-time, per org)

Do this once and record it in `PROJECT.md`. It is org configuration, so a human with Setup access has
to do it — you cannot script your way in.

1. Generate a key pair: `openssl req -x509 -newkey rsa:2048 -nodes -keyout server.key -out server.crt -subj "/CN=pw-tests" -days 730`
2. Setup → App Manager → New Connected App → enable OAuth, upload `server.crt`, enable **Use digital
   signatures**, scopes: `api`, `refresh_token`, `web`.
3. Manage → Edit Policies → Permitted Users = **Admin approved users are pre-authorized**.
4. Assign the app to a Profile or Permission Set that your test users hold. **This step is the one
   everyone forgets** — without it the flow returns `invalid_grant: user hasn't approved this consumer`.
5. Put the consumer key in `SF_CLIENT_ID` and the _contents_ of `server.key` in `SF_JWT_PRIVATE_KEY`
   (or a path in `SF_JWT_KEY_PATH`). Never commit either.

### `password` is a trap

Username-password OAuth requires MFA to be disabled for that user, and Salesforce has been progressively
removing that possibility. It also silently appends a security token requirement that changes whenever
the password changes. Support it for a legacy org, but don't build on it.

## Injecting the session into the browser

Two mechanisms. They depend on **org settings**, so verify which works in your org before committing to
one (see `docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md`).

```ts
// A. Session cookie injection — preferred. No navigation to a login endpoint at all.
await context.addCookies([
  {
    name: 'sid',
    value: accessToken,
    domain: new URL(instanceUrl).hostname,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'None',
  },
]);

// B. frontdoor.jsp — the classic fallback.
await page.goto(
  `${instanceUrl}/secur/frontdoor.jsp?sid=${accessToken}&retURL=${encodeURIComponent(ret)}`,
);
```

Caveats you must know:

- **`frontdoor.jsp` is being restricted.** Salesforce has shipped release updates that limit passing a
  session id to `frontdoor.jsp`. Treat B as a fallback and expect it to stop working; prefer A.
- **"Lock sessions to the IP address from which they originated"** (Setup → Session Settings) breaks
  _both_ if your API call and browser egress from different IPs. In CI they usually match; through a
  proxy they may not. If auth mysteriously 302s to login, check this setting first.
- **My Domain matters.** The cookie domain must be the _instance_ host the session belongs to
  (`https://acme--uat.sandbox.my.salesforce.com`), not the Lightning host
  (`...lightning.force.com`). Use `instance_url` from the token response verbatim — don't construct it.

## SSO orgs

If the org is SSO-only for humans, that does not affect you: the JWT bearer flow bypasses the IdP
entirely because it authenticates the _Connected App_, not the browser session. This is the main reason
to prefer `jwt` over anything interactive. Do not attempt to script an IdP login page.

## One storageState per persona

Salesforce assertions are always "for whom" (see `salesforce-personas`), so the auth setup fans out:

```ts
// helpers/salesforce/personas.setup.ts — one setup test per persona
for (const persona of PERSONAS) {
  setup(`authenticate ${persona.key}`, async ({ browser }) => {
    const session = await getOrgSession(persona.key);
    const context = await browser.newContext();
    await applySession(context, session);
    await context.storageState({ path: storageStateFor(persona.key) });
    await context.close();
  });
}
```

Each persona's state lands at `.auth/<environment>/sf-<persona>.json`. UI projects declare which one
they default to; a test needing a different persona uses the `asPersona` fixture.

Three details that matter:

- **The path is namespaced by `ENVIRONMENT`, not just by persona.** Run this against dev, then
  staging, and each keeps its own state — without the environment segment, the second run would
  either silently overwrite the first's file or (worse) a stale dev session would get handed to a
  staging test, which fails in a way that looks like an auth bug rather than an environment mixup.
- **The fan-out iterates `UI_PERSONAS`, not all of them.** An API-only identity (`uiCapable: false`,
  e.g. an integration user) has no UI licence, so building a browser session for it fails for a
  perfectly correct reason and would block the whole run.
- **The UI default is `standardUser`, not an admin.** `SF_ADMIN_PERSONA` (arrange/teardown) and
  `SF_DEFAULT_PERSONA` (the subject) are deliberately separate env vars. A UI test running as System
  Admin exercises a screen no real user sees and bypasses sharing and FLS — see `salesforce-personas`.

**Never** reuse one persona's context for another persona's assertions. Cached Lightning state and
cached org metadata will make the test pass alone and fail in the suite.

## Verify the session actually worked

A failed injection presents as "logged out", which then looks like a locator bug thirty lines later.
Assert it once, in setup, before saving state:

```ts
await page.goto(LightningRoutes.HOME);
// A real Lightning shell is present only when authenticated.
await expect(page.getByRole('button', { name: 'App Launcher' })).toBeVisible();
```

## Don't

- Don't automate the login form or an MFA challenge.
- Don't generate TOTP codes in test code. It's feasible and it's still wrong — it moves the MFA secret
  into your CI and produces a test that fails at clock skew.
- Don't hardcode `instance_url` — sandbox refreshes and org migrations change it. Read it from the token
  response.
- Don't reuse a session across personas.
- Don't log the access token. It _is_ a live session id. `helpers/salesforce/auth.ts` redacts it.
- Don't commit `server.key`, `SF_JWT_PRIVATE_KEY`, or any `.auth/*.json`.

## Checklist

- [ ] Strategy chosen per environment (`jwt` in CI).
- [ ] Connected App assigned to the test users' profile/permset (step 4 above).
- [ ] Session injected, not typed into a form.
- [ ] `instance_url` read from the token response.
- [ ] One `storageState` per UI-capable persona, verified with a post-auth assertion.
- [ ] `SF_ADMIN_PERSONA` (arrange) and `SF_DEFAULT_PERSONA` (subject) both set, and the subject is NOT
      an admin.
- [ ] No token in logs, no key in git.
