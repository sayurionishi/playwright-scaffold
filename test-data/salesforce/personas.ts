/**
 * Test personas — the identities the suite authenticates as.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE TWO RULES THAT MATTER MOST
 *
 * 1. THE IDENTITY THAT ARRANGES IS NOT THE IDENTITY UNDER TEST.
 *    System Admin creates and deletes records (`adminOrg` fixture). The persona under test
 *    performs the behaviour and makes the assertions (`org` / UI projects). Mixing them produces
 *    two silent failure modes:
 *      - Teardown as a restricted persona has no Delete → cleanup fails quietly → data leaks.
 *      - Assertions as an admin → "Modify All Data" bypasses sharing AND field-level security, so
 *        every permission bug you were trying to catch passes.
 *
 * 2. PERSONAS FORM A LATTICE, NOT A LIST.
 *    Each persona differs from its neighbour along EXACTLY ONE permission axis, so a failing
 *    matrix cell tells you which axis broke. A persona that differs on three axes at once
 *    produces failures you have to debug rather than read.
 *
 * The four axes:
 *    CRUD     — object-level create/read/update/delete
 *    FLS      — field-level visibility and editability
 *    SHARING  — which RECORDS are visible (OWD, role hierarchy, sharing rules)
 *    UI       — whether the identity can use the browser UI at all (license)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ── THESE ARE EXAMPLES ──────────────────────────────────────────────────────────────────────
 * Replace with YOUR org's real personas during bootstrap. `profile`, `permissionSets`, and `role`
 * document INTENT — `tests/salesforce/contract/permissions.spec.ts` asserts the org actually
 * matches, so these strings are checked, never trusted. Do not write them from memory; read them
 * from the org (Constitution #15 in spirit — they are org state).
 *
 * Each persona needs:
 *   1. a real org user
 *   2. env var `SF_USERNAME_<UPPER_SNAKE_KEY>` (salesRep → SF_USERNAME_SALES_REP)
 *   3. the Connected App assigned to its Profile or a Permission Set it holds — otherwise JWT auth
 *      fails with `invalid_grant: user hasn't approved this consumer`
 */

/**
 * What a persona is FOR. Machine-readable so misuse can be caught rather than reviewed.
 *
 *  `arrange`  — privileged setup/teardown identity. NEVER the subject of an assertion.
 *  `control`  — the positive control: the least-privileged identity that SHOULD have access.
 *  `subject`  — a realistic end user; the default identity for UI behaviour tests.
 *  `boundary` — exists to prove a denial actually denies (and that deny tests can fail).
 */
export type PersonaPurpose = 'arrange' | 'control' | 'subject' | 'boundary';

export interface Persona {
  /** Stable key used in env vars, storageState paths, and test names. */
  readonly key: string;
  /** Human label for test titles and reports. */
  readonly label: string;
  /** Expected Profile name — asserted against the org, not trusted. */
  readonly profile: string;
  /** Expected Permission Sets (excluding profile-owned ones) — asserted, not trusted. */
  readonly permissionSets: readonly string[];
  /** Expected Role, when the persona exists to exercise the role hierarchy. */
  readonly role?: string;
  /**
   * True when this identity bypasses sharing and FLS ("View All Data" / "Modify All Data").
   *
   * A privileged persona can NEVER be used as a positive control or as the subject of a
   * permission assertion — it would pass even with the permission model completely broken.
   */
  readonly privileged: boolean;
  /** False for API-only identities (no UI license). Such a persona gets no storageState. */
  readonly uiCapable: boolean;
  readonly purpose: PersonaPurpose;
  /** Why this persona exists — what a failure involving it actually tells you. */
  readonly isolates: string;
}

export const Personas = {
  /**
   * ARRANGE / TEARDOWN ONLY. Modify All Data, so it can delete anything and is never blocked by
   * FLS or sharing — exactly what setup needs, and exactly why it must never assert.
   */
  sysAdmin: {
    key: 'sysAdmin',
    label: 'System Administrator',
    profile: 'System Administrator',
    permissionSets: [],
    privileged: true,
    uiCapable: true,
    purpose: 'arrange',
    isolates: 'nothing — it is the arrange/teardown identity, never a test subject',
  },

  /**
   * THE POSITIVE CONTROL. Full CRUD and every field visible, but NOT an admin.
   *
   * That distinction is the whole point: if your control is System Admin, it passes via Modify All
   * Data even when the permission set that is supposed to grant this access is broken. The control
   * must be the least-privileged identity that SHOULD have access.
   */
  fullAccess: {
    key: 'fullAccess',
    label: 'Full Access User',
    profile: 'Standard User',
    permissionSets: ['Full_Object_Access', 'All_Fields_Visible'],
    privileged: false,
    uiCapable: true,
    purpose: 'control',
    isolates: 'grant correctness — proves the permission set actually grants, without admin bypass',
  },

  /**
   * THE DEFAULT UI SUBJECT. What a realistic end user has: create, read, edit — no delete.
   * Most UI behaviour tests should run as this persona.
   */
  standardUser: {
    key: 'standardUser',
    label: 'Standard User',
    profile: 'Standard User',
    permissionSets: [],
    privileged: false,
    uiCapable: true,
    purpose: 'subject',
    isolates: 'the realistic default — the screen an actual user sees',
  },

  /**
   * Same object CRUD as `standardUser`, but a permission set HIDES specific fields.
   * Differs from standardUser on the FLS axis only → a failure here is field-level, not CRUD.
   */
  limitedFields: {
    key: 'limitedFields',
    label: 'Limited Field Access',
    profile: 'Standard User',
    permissionSets: ['Restricted_Field_Visibility'],
    privileged: false,
    uiCapable: true,
    purpose: 'subject',
    isolates: 'FLS — same CRUD as standardUser, fewer visible fields',
  },

  /**
   * Read on everything, no Create/Edit/Delete. All fields visible.
   * Differs from `fullAccess` on the CRUD axis only → a failure here is object-level, not FLS.
   */
  readOnly: {
    key: 'readOnly',
    label: 'Read Only',
    profile: 'Read Only',
    permissionSets: [],
    privileged: false,
    uiCapable: true,
    purpose: 'subject',
    isolates: 'CRUD — same field visibility as fullAccess, no write',
  },

  /**
   * No access to the object at all.
   *
   * WHY THIS PERSONA EXISTS: it proves your denial assertions can actually fail. A suite that only
   * ever asserts "restricted user cannot X" may be passing vacuously — wrong locator, failed
   * request, wrong object. This persona is the hard floor that makes the deny path real.
   */
  noAccess: {
    key: 'noAccess',
    label: 'No Object Access',
    profile: 'Minimum Access - Salesforce',
    permissionSets: [],
    privileged: false,
    uiCapable: true,
    purpose: 'boundary',
    isolates: 'the deny path — proves 403/404 assertions are not passing vacuously',
  },

  /**
   * Above `subordinate` in the role hierarchy. Same CRUD and FLS as subordinate — the ONLY
   * difference is position in the hierarchy, so a failure isolates SHARING.
   *
   * Most Salesforce suites test FLS and CRUD and never touch sharing. This is that axis.
   */
  manager: {
    key: 'manager',
    label: 'Sales Manager (role hierarchy parent)',
    profile: 'Standard User',
    permissionSets: [],
    role: 'Sales Manager',
    privileged: false,
    uiCapable: true,
    purpose: 'control',
    isolates: 'SHARING (sees down the hierarchy) — identical CRUD/FLS to subordinate',
  },

  /**
   * Below `manager` in the role hierarchy. Must NOT see the manager's records.
   * Pairs with `manager` to test the hierarchy in both directions.
   */
  subordinate: {
    key: 'subordinate',
    label: 'Sales Rep (role hierarchy child)',
    profile: 'Standard User',
    permissionSets: [],
    role: 'Sales Rep',
    privileged: false,
    uiCapable: true,
    purpose: 'subject',
    isolates: 'SHARING (cannot see up the hierarchy) — identical CRUD/FLS to manager',
  },

  /**
   * API-only integration identity. `uiCapable: false`, so it gets NO storageState.
   *
   * Worth having because "this integration user cannot log into the UI" is a genuine security
   * assertion, and because integration users often carry broad API grants that nobody audits.
   */
  integrationUser: {
    key: 'integrationUser',
    label: 'Integration User (API only)',
    profile: 'Integration User',
    permissionSets: ['Integration_Api_Access'],
    privileged: false,
    uiCapable: false,
    purpose: 'boundary',
    isolates: 'UI axis — broad API access must not imply UI access',
  },

  // ── Extensions worth considering for your org ──────────────────────────────────────────────
  // - A Permission Set GROUP persona with MUTING — muting is the subtlest part of the stack and
  //   the easiest to get wrong.
  // - An Experience Cloud / partner community user — a different licence and sharing model
  //   entirely; high value if you have a portal, but it needs its own auth path.
  // - A queue/team-based persona if you use Case teams or account teams.
  // - A persona per record type where layouts genuinely diverge.
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof Personas;

export const ALL_PERSONAS: readonly Persona[] = Object.values(Personas);

/** Personas that get a browser storageState. API-only identities are excluded by design. */
export const UI_PERSONAS: readonly Persona[] = ALL_PERSONAS.filter((p) => p.uiCapable);

/** Personas valid as an assertion subject — privileged identities bypass what we're testing. */
export const ASSERTABLE_PERSONAS: readonly Persona[] = ALL_PERSONAS.filter((p) => !p.privileged);

export function persona(key: PersonaKey): Persona {
  return Personas[key];
}

/**
 * Guard: refuse to use a privileged identity where a permission assertion is intended.
 *
 * Called by the positive-control and matrix helpers. An admin subject makes a permission test
 * pass no matter how broken the org is, which is worse than having no test — it reports safety
 * that isn't there.
 */
export function assertAssertable(p: Persona): void {
  if (p.privileged) {
    throw new Error(
      `Persona "${p.key}" is privileged (bypasses sharing and FLS) and cannot be the subject of a ` +
        'permission assertion — it would pass even with the permission model completely broken. ' +
        'Use the least-privileged persona that SHOULD have access. See `salesforce-personas`.',
    );
  }
}
