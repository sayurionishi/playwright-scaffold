/**
 * Test personas — the identities the suite authenticates as.
 *
 * WHY THIS FILE EXISTS: in most Salesforce orgs the permission model IS the deliverable. Every
 * assertion is really "…for whom?", so the persona is a first-class test input rather than an
 * incidental login. See the `salesforce-personas` skill.
 *
 * ── THESE ARE EXAMPLES ──────────────────────────────────────────────────────────────────────
 * Replace them with YOUR org's real personas during bootstrap. `profile` and `permissionSets`
 * document INTENT — the tests assert the org actually matches, they don't trust these strings.
 * Do not write profile or permission set names from memory; read them from the org.
 *
 * Each persona needs:
 *   1. a real org user
 *   2. an env var `SF_USERNAME_<UPPER_SNAKE_KEY>` (e.g. salesRep → SF_USERNAME_SALES_REP)
 *   3. the Connected App assigned to its profile or a permission set it holds — otherwise JWT
 *      auth fails with `invalid_grant: user hasn't approved this consumer`
 */

export interface Persona {
  /** Stable key used in env vars, storageState paths, and test names. */
  readonly key: string;
  /** Human label for test titles and reports. */
  readonly label: string;
  /** Expected Profile name — documentation of intent; asserted, not trusted. */
  readonly profile: string;
  /** Expected Permission Sets — documentation of intent; asserted, not trusted. */
  readonly permissionSets: readonly string[];
}

export const Personas = {
  admin: {
    key: 'admin',
    label: 'System Administrator',
    profile: 'System Administrator',
    permissionSets: [],
  },
  salesRep: {
    key: 'salesRep',
    label: 'Sales Rep',
    profile: 'Sales User',
    permissionSets: [],
  },
  salesManager: {
    key: 'salesManager',
    label: 'Sales Manager',
    profile: 'Sales User',
    permissionSets: ['Sales_Manager_Access'],
  },
  readOnly: {
    key: 'readOnly',
    label: 'Read Only',
    profile: 'Read Only',
    permissionSets: [],
  },
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof Personas;

/** Every persona, for the auth setup fan-out. */
export const ALL_PERSONAS: readonly Persona[] = Object.values(Personas);

export function persona(key: PersonaKey): Persona {
  return Personas[key];
}
