/**
 * The declarative Salesforce contract shape.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THE CONTRACT IS DATA, NOT CODE
 *
 * A Salesforce contract has four dimensions that all drift independently:
 *
 *   SHAPE       field types, lengths, nillable, picklist values, reference targets
 *   CRUD        which personas can create / read / update / delete the object
 *   FLS         which fields each persona can see and edit
 *   GRANTS      which permission sets are actually assigned to each persona
 *
 * Expressed as code, that's a combinatorial mess of near-identical tests. Expressed as data, it's
 * a table: one spec iterates it, and adding a field or a persona is a single row. Coverage becomes
 * something you can READ rather than something you have to audit.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Everything here is ORG STATE. Populate it from `describe` (`npm run sf:schemas` prints the
 * types), never from memory — Constitution #15.
 */

/** Salesforce `describe` field types. Union rather than `string` so a typo is a compile error. */
export type SalesforceFieldType =
  | 'id'
  | 'string'
  | 'textarea'
  | 'boolean'
  | 'int'
  | 'double'
  | 'currency'
  | 'percent'
  | 'date'
  | 'datetime'
  | 'time'
  | 'email'
  | 'phone'
  | 'url'
  | 'picklist'
  | 'multipicklist'
  | 'reference'
  | 'address'
  | 'location'
  | 'encryptedstring'
  | 'base64'
  | 'combobox'
  | 'anyType';

/**
 * The SHAPE contract for one field.
 *
 * Only assert what you actually depend on — every entry is a thing that will (correctly) fail a
 * build when an admin changes it, so an over-specified contract is a maintenance tax. Under-specify
 * and drift slips through. Types and picklist values are almost always worth pinning; labels never.
 */
export interface FieldContract {
  readonly name: string;
  readonly type: SalesforceFieldType;
  /** Max length for textual types. Pin it when you rely on it — a shortened field truncates data. */
  readonly length?: number;
  /** Whether the field accepts null. Flipping this to false breaks every existing insert path. */
  readonly nillable?: boolean;
  /**
   * ACTIVE picklist values, order-insensitive.
   *
   * The single highest-value thing to pin. Apex, Flows, and validation rules branch on these
   * strings, so an admin adding or renaming one is a genuine break — and it's invisible until
   * something downstream misbehaves in production.
   */
  readonly picklistValues?: readonly string[];
  /** True when the picklist rejects values outside the list. Affects your negative tests. */
  readonly restrictedPicklist?: boolean;
  /** For `reference` fields: which object(s) it points at. Relationship integrity. */
  readonly referenceTo?: readonly string[];
  readonly unique?: boolean;
  readonly externalId?: boolean;
  /** For numeric types. */
  readonly precision?: number;
  readonly scale?: number;
}

/** Object-level CRUD as ONE persona sees it. */
export interface ObjectCrudExpectation {
  readonly createable: boolean;
  readonly updateable: boolean;
  readonly deletable: boolean;
  readonly queryable: boolean;
}

/** Field-level access as ONE persona sees ONE field. */
export interface FieldAccessExpectation {
  /** Present in `ui-api/object-info` at all — a hidden field is absent, not flagged. */
  readonly visible: boolean;
  /** Editable by this persona (`updateable` in object-info). */
  readonly editable: boolean;
  /** Required on the layout/schema for this persona. */
  readonly required?: boolean;
}

/**
 * The full contract for one object.
 *
 * `visibleFields` deserves special attention — see the doc comment on the property. It is the
 * strongest single assertion in this file.
 *
 * ── ONE ENVIRONMENT, BY DEFAULT ────────────────────────────────────────────────────────────────
 * Everything below (`fields`, `crudByPersona`, `fieldAccessByPersona`, `visibleFieldsByPersona`)
 * represents ONE environment's expected model — whichever org you wrote/generated it against. This
 * is deliberate, not an oversight: env-keying every property here (the way the AUTO-GENERATED
 * `describe` snapshot is env-keyed — see `scripts/generate-sobject-schemas.ts`) would add a
 * `Record<string, X>` layer to every field of this interface, for the benefit of a divergence that
 * usually SHOULDN'T exist — dev and staging permission models drifting is often itself a bug worth
 * surfacing, not a difference to paper over.
 *
 * If your org's environments genuinely and intentionally diverge (a permission set only exists in
 * staging while a rollout is in progress, say), the escape hatch is to maintain separate contract
 * files and select one:
 *
 *   // account.contract.ts always exports the CURRENT environment's contract
 *   export const AccountContract =
 *     salesforceConfig.environment === 'staging' ? AccountContractStaging : AccountContractDev;
 *
 * Keep this the exception. If it becomes the rule, that is itself worth raising as an org hygiene
 * problem — see `docs/salesforce/TEST-ARCHITECTURE.md` §"Multi-environment".
 */
export interface ObjectContract {
  /** Object API name — from `describe`, never memory. */
  readonly object: string;
  /** Expected 3-char Id key prefix. From `describe.keyPrefix`; custom objects are org-assigned. */
  readonly keyPrefix?: string;
  /** Record type developer names that must exist. Layouts and picklists vary by record type. */
  readonly recordTypes?: readonly string[];

  /** SHAPE — the field contract. Only the fields the suite actually depends on. */
  readonly fields: readonly FieldContract[];

  /** CRUD — keyed by persona key. */
  readonly crudByPersona: Readonly<Record<string, ObjectCrudExpectation>>;

  /** FLS — keyed by persona key, then by field API name. Sparse: list only what you assert. */
  readonly fieldAccessByPersona: Readonly<
    Record<string, Readonly<Record<string, FieldAccessExpectation>>>
  >;

  /**
   * The EXACT set of field API names each persona may see. Order-insensitive, compared as a set.
   *
   * ── WHY THIS BEATS FIELD-BY-FIELD ASSERTIONS ────────────────────────────────────────────────
   * `fieldAccessByPersona` only checks fields you thought to list. So when an admin adds
   * `Commission_Rate__c` next quarter and it defaults to visible for every profile, nothing fails —
   * the field isn't in your table, so nobody asked about it. That is precisely how field-level data
   * leaks reach production.
   *
   * An exact-set assertion inverts the default: a NEW field visible to a restricted persona fails
   * immediately, because the set no longer matches. You get told about fields you didn't know to
   * ask about.
   *
   * Cost: every legitimate schema change updates these lists. That's the correct trade — the
   * failure is loud, one-line to fix, and reviewed.
   *
   * Populate with `npm run sf:visible-fields` (prints the live set per persona).
   */
  readonly visibleFieldsByPersona?: Readonly<Record<string, readonly string[]>>;
}

/** Expected permission-set grants for a persona. Asserted against PermissionSetAssignment. */
export interface PersonaGrantContract {
  readonly personaKey: string;
  /** Permission sets that MUST be assigned. Profile-owned sets are excluded from the comparison. */
  readonly permissionSets: readonly string[];
  /** When true, the assignment set must match EXACTLY — no extra sets. Recommended. */
  readonly exact: boolean;
  /** Expected Profile name. */
  readonly profile?: string;
  /** Expected Role developer name, for sharing/hierarchy personas. */
  readonly role?: string;
}
