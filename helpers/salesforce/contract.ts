/**
 * Contract assertion helpers.
 *
 * These turn the declarative contract data (`test-data/salesforce/contracts/`) into assertions.
 * Two deliberate choices throughout:
 *
 *  1. **Soft assertions** (`expect.soft`) for per-field checks, so ONE run reports every drifted
 *     field instead of stopping at the first. Fixing 12 fields across 12 red runs is how people
 *     start ignoring contract tests.
 *  2. **Failure messages name the fix.** A contract failure should say what changed and what to do
 *     (regenerate, or file it) — never just `expected true, got false`.
 *
 * See the `salesforce-metadata-contract` skill.
 */

import { expect } from '@playwright/test';
import type { DescribeResult } from '../../fixtures/salesforce/schemas/describe.schema';
import type { ObjectInfo } from '../../fixtures/salesforce/schemas/describe.schema';
import type {
  FieldAccessExpectation,
  FieldContract,
  ObjectContract,
  ObjectCrudExpectation,
} from '../../test-data/salesforce/contracts/contract-types';

const REGENERATE = 'Run `npm run sf:schemas -- <Object>` and review the diff like code.';

/**
 * Assert one field's SHAPE against `describe`.
 *
 * Only the properties present in the contract are checked — an omitted property is explicitly
 * "we don't depend on this", not "we forgot".
 */
export function assertFieldShape(describe: DescribeResult, contract: FieldContract): void {
  const field = describe.fields.find((f) => f.name === contract.name);

  // A missing field is a hard failure, not a soft one: every subsequent check would be noise.
  expect(
    field,
    `${describe.name}.${contract.name} does not exist in the org. Either an admin deleted it ` +
      `(file it — do not delete the contract entry to make this pass) or the API name is wrong. ${REGENERATE}`,
  ).toBeDefined();
  if (field === undefined) return;

  const where = `${describe.name}.${contract.name}`;

  expect
    .soft(
      field.type,
      `${where} type changed — downstream schemas and Apex may break. ${REGENERATE}`,
    )
    .toBe(contract.type);

  if (contract.length !== undefined) {
    expect
      .soft(
        field.length,
        `${where} max length changed. A SHORTENED field silently truncates data on write.`,
      )
      .toBe(contract.length);
  }

  if (contract.nillable !== undefined) {
    expect
      .soft(
        field.nillable,
        `${where} nillable changed. Becoming non-nillable breaks every existing insert that omits it.`,
      )
      .toBe(contract.nillable);
  }

  if (contract.picklistValues !== undefined) {
    const live = field.picklistValues
      .filter((value) => value.active)
      .map((value) => value.value)
      .sort();
    expect
      .soft(
        live,
        `${where} ACTIVE picklist values changed. Apex, Flows, and validation rules branch on these ` +
          'strings, so this is usually a real break — and invisible until something misbehaves.',
      )
      .toEqual([...contract.picklistValues].sort());
  }

  if (contract.restrictedPicklist !== undefined) {
    expect
      .soft(
        field.restrictedPicklist ?? false,
        `${where} restrictedPicklist changed — this alters whether invalid values are rejected, ` +
          'so your negative tests may now be asserting the wrong thing.',
      )
      .toBe(contract.restrictedPicklist);
  }

  if (contract.referenceTo !== undefined) {
    expect
      .soft(
        [...field.referenceTo].sort(),
        `${where} relationship target changed — a repointed lookup breaks joins and SOQL traversals.`,
      )
      .toEqual([...contract.referenceTo].sort());
  }

  if (contract.unique !== undefined) {
    expect.soft(field.unique ?? false, `${where} unique flag changed.`).toBe(contract.unique);
  }

  if (contract.externalId !== undefined) {
    expect
      .soft(
        field.externalId ?? false,
        `${where} externalId flag changed — upsert keys depend on it.`,
      )
      .toBe(contract.externalId);
  }

  if (contract.precision !== undefined) {
    expect.soft(field.precision, `${where} precision changed.`).toBe(contract.precision);
  }
  if (contract.scale !== undefined) {
    expect
      .soft(field.scale, `${where} scale changed — rounding behaviour differs.`)
      .toBe(contract.scale);
  }
}

/** Assert every field shape in a contract, plus object-level facts. */
export function assertObjectShape(describe: DescribeResult, contract: ObjectContract): void {
  if (contract.keyPrefix !== undefined) {
    expect
      .soft(
        describe.keyPrefix,
        `${contract.object} keyPrefix changed — that means this is a different object than the ` +
          'contract was written against.',
      )
      .toBe(contract.keyPrefix);
  }

  if (contract.recordTypes !== undefined) {
    const live = describe.recordTypeInfos
      .filter((rt) => !rt.master)
      .map((rt) => rt.name)
      .sort();
    expect
      .soft(
        live,
        `${contract.object} record types changed. Layouts, picklist availability, and required ` +
          'fields all vary by record type, so this changes what personas actually see.',
      )
      .toEqual([...contract.recordTypes].sort());
  }

  for (const field of contract.fields) {
    assertFieldShape(describe, field);
  }
}

/**
 * Assert object-level CRUD for one persona against `ui-api/object-info`.
 *
 * `object-info` is calling-user aware — it resolves profile + permission sets + muting as actually
 * applied. `describe` is org-wide and would NOT catch a persona-specific regression.
 */
export function assertObjectCrud(
  info: ObjectInfo,
  personaKey: string,
  expected: ObjectCrudExpectation,
): void {
  const where = `${info.apiName} CRUD for persona "${personaKey}"`;
  expect.soft(info.createable, `${where}: createable`).toBe(expected.createable);
  expect.soft(info.updateable, `${where}: updateable`).toBe(expected.updateable);
  expect.soft(info.deletable, `${where}: deletable`).toBe(expected.deletable);
  expect.soft(info.queryable, `${where}: queryable`).toBe(expected.queryable);
}

/**
 * Assert one field's access for one persona.
 *
 * Remember the asymmetry: a field the persona cannot see is ABSENT from `object-info.fields`
 * entirely — there is no `visible: false` flag. Absence IS the signal.
 */
export function assertFieldAccess(
  info: ObjectInfo,
  personaKey: string,
  fieldName: string,
  expected: FieldAccessExpectation,
): void {
  const field = info.fields[fieldName];
  const where = `${info.apiName}.${fieldName} for persona "${personaKey}"`;

  expect
    .soft(
      field !== undefined,
      expected.visible
        ? `${where}: expected VISIBLE but the field is absent from object-info. Either FLS was ` +
            'revoked, or the field API name is wrong — check before assuming a permission change.'
        : `${where}: expected HIDDEN but the field is present. This is a field-level data leak ` +
            'for this persona.',
    )
    .toBe(expected.visible);

  if (field === undefined) return;

  expect
    .soft(
      field.updateable,
      `${where}: editable expected ${String(expected.editable)}. A field readable but not ` +
        'editable is a common and easily-missed regression.',
    )
    .toBe(expected.editable);

  if (expected.required !== undefined) {
    expect
      .soft(
        field.required,
        `${where}: required expected ${String(expected.required)}. Becoming required breaks every ` +
          'existing create path that omits it — including your own factories.',
      )
      .toBe(expected.required);
  }
}

/**
 * Assert the EXACT set of fields a persona can see.
 *
 * ── THE STRONGEST ASSERTION IN THE PACK ─────────────────────────────────────────────────────
 * Field-by-field checks only cover fields you thought to list. So when an admin adds
 * `Commission_Rate__c` and it defaults to visible for every profile, nothing fails — nobody asked
 * about it. That is exactly how field-level data leaks reach production.
 *
 * This inverts the default: an unexpected VISIBLE field fails immediately. You get told about
 * fields you didn't know to ask about, which is the only way this class of bug gets caught.
 *
 * The reported diff is split into "newly visible" (the leak direction — treat as urgent) and
 * "no longer visible" (usually a legitimate removal, still needs a decision).
 */
export function assertVisibleFieldSet(
  info: ObjectInfo,
  personaKey: string,
  expectedFields: readonly string[],
): void {
  const live = new Set(Object.keys(info.fields));
  const expectedSet = new Set(expectedFields);

  const newlyVisible = [...live].filter((name) => !expectedSet.has(name)).sort();
  const noLongerVisible = [...expectedSet].filter((name) => !live.has(name)).sort();

  expect(
    { newlyVisible, noLongerVisible },
    `Visible-field set changed for persona "${personaKey}" on ${info.apiName}.\n` +
      (newlyVisible.length > 0
        ? `  ⚠️ NEWLY VISIBLE (potential data leak — triage first): ${newlyVisible.join(', ')}\n`
        : '') +
      (noLongerVisible.length > 0 ? `  NO LONGER VISIBLE: ${noLongerVisible.join(', ')}\n` : '') +
      'If the change is intended, regenerate with `npm run sf:visible-fields` and commit. ' +
      'Do NOT widen the expected list without understanding why the field appeared.',
  ).toEqual({ newlyVisible: [], noLongerVisible: [] });
}
