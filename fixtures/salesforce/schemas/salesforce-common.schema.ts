import { z } from 'zod';

/**
 * Shared Salesforce response primitives.
 *
 * `z.strictObject` everywhere (Constitution #6). On Salesforce this does double duty: it catches
 * contract drift AND it catches FLS regressions, because a field you lack access to is silently
 * omitted from the response rather than erroring. See `salesforce-personas`.
 */

/**
 * A Salesforce record Id: 15 (case-sensitive) or 18 (case-safe) characters. Both are valid and
 * the API returns 18 — accept both so a 15-char Id from a URL or a report doesn't fail validation.
 */
export const SalesforceIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/, 'Not a valid 15- or 18-character Salesforce Id');

/** The `attributes` envelope every queried record carries. */
export const SObjectAttributesSchema = z.strictObject({
  type: z.string(),
  url: z.string(),
});

/**
 * Salesforce REST errors arrive as an ARRAY, even for a single error. A schema expecting an object
 * here is the most common Salesforce schema mistake.
 */
export const SalesforceErrorSchema = z.strictObject({
  message: z.string(),
  errorCode: z.string(),
  fields: z.array(z.string()).optional(),
});
export const SalesforceErrorListSchema = z.array(SalesforceErrorSchema);
export type SalesforceError = z.output<typeof SalesforceErrorSchema>;

/** Response from POST /sobjects/<Object> — a single record create. */
export const CreateResponseSchema = z.strictObject({
  id: SalesforceIdSchema,
  success: z.boolean(),
  errors: z.array(SalesforceErrorSchema),
});
export type CreateResponse = z.output<typeof CreateResponseSchema>;

/** Envelope from GET /query?q=... Note `done`/`nextRecordsUrl` for pagination. */
export function queryResultSchema<T extends z.ZodTypeAny>(recordSchema: T) {
  return z.strictObject({
    totalSize: z.number().int().nonnegative(),
    done: z.boolean(),
    nextRecordsUrl: z.string().optional(),
    records: z.array(recordSchema),
  });
}

/** GET /services/data/ — every API version the org supports. Used to assert the version pin. */
export const VersionListSchema = z.array(
  z.strictObject({
    label: z.string(),
    url: z.string(),
    version: z.string(),
  }),
);

/** One limit entry from GET /limits. */
export const LimitEntrySchema = z.strictObject({
  Max: z.number(),
  Remaining: z.number(),
});

/**
 * GET /limits. Deliberately NOT strict: Salesforce adds limit keys every release, and a new
 * limit appearing is not drift worth failing a run over. `DailyApiRequests` is the one that
 * matters — see `salesforce-data`.
 */
export const LimitsSchema = z
  .object({
    DailyApiRequests: LimitEntrySchema,
  })
  .catchall(z.unknown());
export type Limits = z.output<typeof LimitsSchema>;

/**
 * POST /composite response.
 *
 * ⚠️ THE TRAP: the outer HTTP status is 200 even when subrequests failed. The truth is in each
 * subrequest's `httpStatusCode`. A test asserting only the outer status is a false green.
 */
export const CompositeResponseSchema = z.strictObject({
  compositeResponse: z.array(
    z.strictObject({
      body: z.unknown(),
      httpHeaders: z.record(z.string(), z.string()),
      httpStatusCode: z.number().int(),
      referenceId: z.string(),
    }),
  ),
});
export type CompositeResponse = z.output<typeof CompositeResponseSchema>;

/**
 * POST /composite/tree/<Object> response. Same trap: check `hasErrors`, not just the status.
 */
export const CompositeTreeResponseSchema = z.strictObject({
  hasErrors: z.boolean(),
  results: z.array(
    z.strictObject({
      referenceId: z.string(),
      id: SalesforceIdSchema.optional(),
      errors: z.array(SalesforceErrorSchema).optional(),
    }),
  ),
});
export type CompositeTreeResponse = z.output<typeof CompositeTreeResponseSchema>;

/** A row from the UserRecordAccess sharing query. See `salesforce-personas`. */
export const UserRecordAccessSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  RecordId: SalesforceIdSchema,
  HasReadAccess: z.boolean(),
  HasEditAccess: z.boolean(),
  HasDeleteAccess: z.boolean(),
});
export type UserRecordAccess = z.output<typeof UserRecordAccessSchema>;
