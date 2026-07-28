import type { ObjectContract, PersonaGrantContract } from './contract-types';
import { Personas } from '../personas';
import { SObjects } from '../../../enums/salesforce/sobjects';

/**
 * EXAMPLE object contract for Account.
 *
 * ── WHAT IS SAFE HERE AND WHAT IS NOT ───────────────────────────────────────────────────────
 * The `fields` entries below use only STANDARD Account fields with documented types — safe to
 * ship. Everything persona-shaped (`crudByPersona`, `fieldAccessByPersona`,
 * `visibleFieldsByPersona`) describes the EXAMPLE personas and MUST be replaced with your org's
 * real permission model. Custom fields (`__c`) are absent on purpose: inventing one would violate
 * Constitution #15.
 *
 * Populate from the org, not from memory:
 *   npm run sf:schemas -- Account          # types, lengths, picklist values
 *   npm run sf:visible-fields -- Account   # the per-persona visible-field sets
 */
export const AccountContract: ObjectContract = {
  object: SObjects.ACCOUNT,
  keyPrefix: '001',

  // ── SHAPE ────────────────────────────────────────────────────────────────────────────────
  // Only fields the suite actually depends on. Each entry is a thing that will fail the build
  // when an admin changes it — which is the point, but also why you don't list all 200 fields.
  fields: [
    { name: 'Id', type: 'id', nillable: false },
    { name: 'Name', type: 'string', length: 255, nillable: false },
    { name: 'Phone', type: 'phone', length: 40, nillable: true },
    { name: 'Website', type: 'url', length: 255, nillable: true },
    { name: 'AnnualRevenue', type: 'currency', nillable: true },
    { name: 'NumberOfEmployees', type: 'int', nillable: true },
    { name: 'OwnerId', type: 'reference', nillable: false, referenceTo: ['User'] },
    { name: 'CreatedDate', type: 'datetime', nillable: false },
    // Type and Industry ARE picklists on standard Account, but their VALUES are org-configurable —
    // an admin can and does edit them. Uncomment with the real values from `describe`; do not
    // guess them.
    // { name: 'Type', type: 'picklist', picklistValues: ['...'], restrictedPicklist: false },
    // { name: 'Industry', type: 'picklist', picklistValues: ['...'] },
  ],

  // ── CRUD, per persona ────────────────────────────────────────────────────────────────────
  // Note the lattice at work: fullAccess vs readOnly differ ONLY on write, so a failure there is
  // unambiguously object-level. sysAdmin is deliberately absent — it's the arrange identity and is
  // never asserted against.
  crudByPersona: {
    [Personas.fullAccess.key]: {
      createable: true,
      updateable: true,
      deletable: true,
      queryable: true,
    },
    [Personas.standardUser.key]: {
      createable: true,
      updateable: true,
      deletable: false, // deliberately no delete — deletion is an admin/API concern
      queryable: true,
    },
    [Personas.limitedFields.key]: {
      createable: true,
      updateable: true,
      deletable: false,
      queryable: true,
    },
    [Personas.readOnly.key]: {
      createable: false,
      updateable: false,
      deletable: false,
      queryable: true,
    },
    [Personas.noAccess.key]: {
      createable: false,
      updateable: false,
      deletable: false,
      queryable: false, // the hard floor that proves deny assertions can fail
    },
  },

  // ── FLS, per persona per field ───────────────────────────────────────────────────────────
  // Sparse by design: list the fields whose access you actively assert. The exact-set assertion
  // below is what catches fields you did NOT think to list.
  fieldAccessByPersona: {
    [Personas.fullAccess.key]: {
      Name: { visible: true, editable: true, required: true },
      AnnualRevenue: { visible: true, editable: true },
    },
    [Personas.standardUser.key]: {
      Name: { visible: true, editable: true, required: true },
      AnnualRevenue: { visible: true, editable: true },
    },
    [Personas.limitedFields.key]: {
      Name: { visible: true, editable: true, required: true },
      // The isolated difference: same CRUD as standardUser, this field hidden.
      AnnualRevenue: { visible: false, editable: false },
    },
    [Personas.readOnly.key]: {
      Name: { visible: true, editable: false },
      AnnualRevenue: { visible: true, editable: false },
    },
  },

  /**
   * ── THE EXACT-SET ASSERTION ──────────────────────────────────────────────────────────────
   * Left empty on purpose: these lists are org-specific and long. Generate them with
   *   npm run sf:visible-fields -- Account
   * and commit the output.
   *
   * This is the strongest assertion in the file. `fieldAccessByPersona` only checks fields you
   * listed, so a NEW field that defaults to visible for a restricted persona passes silently —
   * which is exactly how field-level leaks ship. An exact-set comparison fails on it immediately.
   */
  visibleFieldsByPersona: {
    // [Personas.limitedFields.key]: ['Id', 'Name', /* ... */],
  },
};

/**
 * Expected permission-set grants.
 *
 * WHY ASSERT THIS: permission drift IS contract drift. An admin removing a permission set
 * assignment changes behaviour for a whole team with no deploy and no notification, and every
 * downstream FLS test starts failing for a reason that looks unrelated. Asserting the grant
 * directly turns that into one clear failure.
 *
 * `exact: true` is recommended — an EXTRA permission set is a privilege escalation, which is the
 * more dangerous direction and the one a "must contain" check misses entirely.
 */
export const PersonaGrants: readonly PersonaGrantContract[] = [
  {
    personaKey: Personas.fullAccess.key,
    profile: Personas.fullAccess.profile,
    permissionSets: Personas.fullAccess.permissionSets,
    exact: true,
  },
  {
    personaKey: Personas.standardUser.key,
    profile: Personas.standardUser.profile,
    permissionSets: Personas.standardUser.permissionSets,
    exact: true,
  },
  {
    personaKey: Personas.limitedFields.key,
    profile: Personas.limitedFields.profile,
    permissionSets: Personas.limitedFields.permissionSets,
    exact: true,
  },
  {
    personaKey: Personas.readOnly.key,
    profile: Personas.readOnly.profile,
    permissionSets: Personas.readOnly.permissionSets,
    exact: true,
  },
  {
    personaKey: Personas.manager.key,
    profile: Personas.manager.profile,
    permissionSets: Personas.manager.permissionSets,
    role: Personas.manager.role,
    exact: true,
  },
  {
    personaKey: Personas.subordinate.key,
    profile: Personas.subordinate.profile,
    permissionSets: Personas.subordinate.permissionSets,
    role: Personas.subordinate.role,
    exact: true,
  },
];

/** Every object contract the suite asserts. Add yours here. */
export const ALL_CONTRACTS: readonly ObjectContract[] = [AccountContract];
