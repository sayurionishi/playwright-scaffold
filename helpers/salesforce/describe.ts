/**
 * Salesforce metadata access + snapshot normalization.
 *
 * `describe` is the contract (`salesforce-metadata-contract`). These helpers fetch it and reduce it
 * to a stable snapshot so the `@contract` drift test is about real contract change, not noise.
 */

import type { ApiRequest } from '../../fixtures/api/api-request';
import { SalesforceApi } from '../../enums/salesforce/salesforce-api';
import {
  DescribeResultSchema,
  ObjectInfoSchema,
  type DescribeField,
  type DescribeResult,
  type FieldSnapshot,
  type ObjectInfo,
  type ObjectSnapshot,
} from '../../fixtures/salesforce/schemas/describe.schema';

/** Fetch full org-wide field metadata for an object. The schema-generation source. */
export async function fetchDescribe(
  org: ApiRequest,
  objectApiName: string,
): Promise<DescribeResult> {
  const { data } = await org.get(SalesforceApi.describe(objectApiName), {
    schema: DescribeResultSchema,
    expectStatus: 200,
  });
  return data;
}

/**
 * Fetch object metadata AS THE CALLING USER SEES IT — resolves profile + permission sets + muting.
 * This is the permission oracle; see `salesforce-personas`.
 */
export async function fetchObjectInfo(org: ApiRequest, objectApiName: string): Promise<ObjectInfo> {
  const { data } = await org.get(SalesforceApi.objectInfo(objectApiName), {
    schema: ObjectInfoSchema,
    expectStatus: 200,
  });
  return data;
}

/**
 * Reduce a describe field to its contract-relevant attributes.
 *
 * Everything dropped here is a thing we're choosing NOT to guard, so keep the kept-set small and
 * justified:
 *  - `label` is dropped: translators and admins change labels without breaking any contract.
 *  - `picklistValues` keeps only ACTIVE values, sorted — inactive values are invisible to users,
 *    and API ordering is not stable.
 */
function snapshotField(field: DescribeField): FieldSnapshot {
  return {
    name: field.name,
    type: field.type,
    length: field.length,
    nillable: field.nillable,
    createable: field.createable,
    updateable: field.updateable,
    picklistValues: field.picklistValues
      .filter((value) => value.active)
      .map((value) => value.value)
      .sort(),
    referenceTo: [...field.referenceTo].sort(),
  };
}

/**
 * Normalize a describe result into the committed snapshot shape.
 *
 * Fields are sorted by API name because Salesforce does not guarantee describe ordering — without
 * this, a reordered response reads as drift and the test cries wolf.
 */
export function normalizeDescribe(describe: DescribeResult): ObjectSnapshot {
  return {
    name: describe.name,
    keyPrefix: describe.keyPrefix,
    createable: describe.createable,
    updateable: describe.updateable,
    deletable: describe.deletable,
    fields: describe.fields.map(snapshotField).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Human-readable diff between a committed snapshot and the live org.
 *
 * Exists so a `@contract` failure says WHAT changed instead of dumping two large objects at the
 * reader. Triage guidance is in `salesforce-metadata-contract`.
 */
export function diffSnapshots(expected: ObjectSnapshot, actual: ObjectSnapshot): string[] {
  const differences: string[] = [];
  const expectedFields = new Map(expected.fields.map((f) => [f.name, f]));
  const actualFields = new Map(actual.fields.map((f) => [f.name, f]));

  for (const name of expectedFields.keys()) {
    if (!actualFields.has(name)) differences.push(`FIELD REMOVED: ${name}`);
  }
  for (const name of actualFields.keys()) {
    if (!expectedFields.has(name)) differences.push(`FIELD ADDED: ${name}`);
  }
  for (const [name, expectedField] of expectedFields) {
    const actualField = actualFields.get(name);
    if (!actualField) continue;
    for (const key of Object.keys(expectedField) as Array<keyof FieldSnapshot>) {
      const before = JSON.stringify(expectedField[key]);
      const after = JSON.stringify(actualField[key]);
      if (before !== after) differences.push(`${name}.${key}: ${before} → ${after}`);
    }
  }
  for (const key of ['keyPrefix', 'createable', 'updateable', 'deletable'] as const) {
    if (expected[key] !== actual[key]) {
      differences.push(
        `${expected.name}.${key}: ${String(expected[key])} → ${String(actual[key])}`,
      );
    }
  }
  return differences;
}

/**
 * Resolve a record type Id by name.
 *
 * Needed because two personas on the same object can face different layouts, picklist values, and
 * required fields depending on record type — so a persona test must pin it. See `salesforce-personas`.
 */
export function recordTypeIdByName(info: ObjectInfo, recordTypeName: string): string | undefined {
  return Object.values(info.recordTypeInfos).find((rt) => rt.name === recordTypeName)?.recordTypeId;
}

/**
 * Field API names the calling user can see. The FLS answer, straight from `object-info` — a field
 * the user lacks access to is simply absent from the map.
 */
export function visibleFieldNames(info: ObjectInfo): string[] {
  return Object.keys(info.fields).sort();
}
