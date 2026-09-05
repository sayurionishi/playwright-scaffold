import { z } from 'zod';

/**
 * Schemas for Salesforce METADATA endpoints — the contract source (`salesforce-metadata-contract`).
 *
 * Salesforce ships no OpenAPI, so `describe` IS the spec. These schemas describe the spec itself,
 * which is why they are deliberately NON-strict: Salesforce adds metadata attributes every release,
 * and a new attribute appearing is not a contract change worth failing on. What we DO guard is the
 * field set of the objects under test — via the generated schemas and the normalized snapshot below.
 */

/** One field's metadata from /sobjects/<Object>/describe. */
export const DescribeFieldSchema = z
  .object({
    name: z.string(),
    label: z.string(),
    type: z.string(),
    /** Max length for textual types; 0 for others. Drives `.max()` in generated schemas. */
    length: z.number().int().nonnegative(),
    /** True when the field accepts null. Drives `.nullable()`. */
    nillable: z.boolean(),
    createable: z.boolean(),
    updateable: z.boolean(),
    custom: z.boolean(),
    /** Non-empty for picklist/multipicklist. Drives the generated `z.enum([...])`. */
    picklistValues: z
      .array(
        z
          .object({
            value: z.string(),
            label: z.string().nullable(),
            active: z.boolean(),
            defaultValue: z.boolean(),
          })
          .catchall(z.unknown()),
      )
      .default([]),
    /** For `reference` fields: which object(s) it points at. */
    referenceTo: z.array(z.string()).default([]),
    precision: z.number().int().optional(),
    scale: z.number().int().optional(),
    /** True when a restricted picklist rejects values outside the list. */
    restrictedPicklist: z.boolean().optional(),
    defaultedOnCreate: z.boolean().optional(),
    unique: z.boolean().optional(),
    externalId: z.boolean().optional(),
  })
  .catchall(z.unknown());
export type DescribeField = z.output<typeof DescribeFieldSchema>;

/** Full result of /sobjects/<Object>/describe. */
export const DescribeResultSchema = z
  .object({
    name: z.string(),
    label: z.string(),
    custom: z.boolean(),
    createable: z.boolean(),
    updateable: z.boolean(),
    deletable: z.boolean(),
    queryable: z.boolean(),
    /** 3-char Id prefix. Read it from here — never assume a custom object's prefix. */
    keyPrefix: z.string().nullable(),
    fields: z.array(DescribeFieldSchema),
    recordTypeInfos: z
      .array(
        z
          .object({
            name: z.string(),
            recordTypeId: z.string(),
            available: z.boolean(),
            defaultRecordTypeMapping: z.boolean(),
            master: z.boolean(),
          })
          .catchall(z.unknown()),
      )
      .default([]),
  })
  .catchall(z.unknown());
export type DescribeResult = z.output<typeof DescribeResultSchema>;

/**
 * One field from /ui-api/object-info/<Object>.
 *
 * This endpoint is CALLING-USER AWARE: `createable`/`updateable` here reflect the caller's
 * resolved profile + permission sets + muting. That makes it the FLS oracle, and it's why
 * `salesforce-personas` asserts against this rather than `describe`.
 */
export const ObjectInfoFieldSchema = z
  .object({
    apiName: z.string(),
    label: z.string(),
    dataType: z.string(),
    createable: z.boolean(),
    updateable: z.boolean(),
    required: z.boolean(),
    custom: z.boolean(),
    length: z.number().int().nonnegative().optional(),
  })
  .catchall(z.unknown());
export type ObjectInfoField = z.output<typeof ObjectInfoFieldSchema>;

/**
 * /ui-api/object-info/<Object>.
 *
 * ⚠️ `fields` is a MAP keyed by field API name, not an array (unlike `describe`). A field the
 * caller cannot see is ABSENT from the map — which is the FLS signal:
 *     expect(Boolean(data.fields['Margin__c'])).toBe(false)
 */
export const ObjectInfoSchema = z
  .object({
    apiName: z.string(),
    label: z.string(),
    createable: z.boolean(),
    updateable: z.boolean(),
    deletable: z.boolean(),
    queryable: z.boolean(),
    custom: z.boolean(),
    keyPrefix: z.string().nullable(),
    fields: z.record(z.string(), ObjectInfoFieldSchema),
    recordTypeInfos: z.record(
      z.string(),
      z
        .object({
          name: z.string(),
          recordTypeId: z.string(),
          available: z.boolean(),
          defaultRecordTypeMapping: z.boolean(),
          master: z.boolean(),
        })
        .catchall(z.unknown()),
    ),
  })
  .catchall(z.unknown());
export type ObjectInfo = z.output<typeof ObjectInfoSchema>;

/**
 * The normalized, committed contract snapshot — what the `@contract` drift test compares against.
 *
 * Only the attributes that a change to would actually break a test are kept. Anything normalized
 * away is a thing we're choosing NOT to guard, so the set is deliberately small. See
 * `normalizeDescribe` in helpers/salesforce/describe.ts.
 */
export const FieldSnapshotSchema = z.strictObject({
  name: z.string(),
  type: z.string(),
  length: z.number().int().nonnegative(),
  nillable: z.boolean(),
  createable: z.boolean(),
  updateable: z.boolean(),
  /** Active picklist values, sorted. Drift here breaks Apex and Flows that branch on them. */
  picklistValues: z.array(z.string()),
  referenceTo: z.array(z.string()),
});
export type FieldSnapshot = z.output<typeof FieldSnapshotSchema>;

export const ObjectSnapshotSchema = z.strictObject({
  name: z.string(),
  keyPrefix: z.string().nullable(),
  createable: z.boolean(),
  updateable: z.boolean(),
  deletable: z.boolean(),
  fields: z.array(FieldSnapshotSchema),
});
export type ObjectSnapshot = z.output<typeof ObjectSnapshotSchema>;
