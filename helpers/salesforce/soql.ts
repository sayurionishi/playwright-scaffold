/**
 * SOQL queries and record lifecycle over the REST API.
 *
 * API setup, never UI setup (`salesforce-data`): clicking through New → fill → Save to create a
 * prerequisite record costs ~30 seconds and imports every Lightning flake into a test that isn't
 * about that screen. One composite/tree call does it in ~200 ms, deterministically.
 */

import type { ApiRequest } from '../../fixtures/api/api-request';
import { salesforceConfig } from '../../config/salesforce.config';
import { SalesforceApi, soqlUrl } from '../../enums/salesforce/salesforce-api';
import { SObjects } from '../../enums/salesforce/sobjects';
import {
  CompositeTreeResponseSchema,
  CreateResponseSchema,
  LimitsSchema,
  queryResultSchema,
  UserRecordAccessSchema,
  type CompositeTreeResponse,
  type CreateResponse,
  type UserRecordAccess,
} from '../../fixtures/salesforce/schemas/salesforce-common.schema';
import { z } from 'zod';

/**
 * Escape a value for safe interpolation into a SOQL string literal.
 *
 * SOQL injection is a real vulnerability class in Salesforce (dynamic SOQL in Apex), and a test
 * helper that builds queries by concatenation is exactly how you'd write a false-negative security
 * test. Always route user-controlled values through here.
 */
export function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Run a SOQL query and validate each record against `recordSchema`. */
export async function soqlQuery<T extends z.ZodTypeAny>(
  org: ApiRequest,
  statement: string,
  recordSchema: T,
): Promise<Array<z.output<T>>> {
  const { data } = await org.get(soqlUrl(statement), {
    schema: queryResultSchema(recordSchema),
    expectStatus: 200,
  });
  return data.records as Array<z.output<T>>;
}

/**
 * Create one record. Returns the create response (id + success + errors).
 *
 * Generic over the draft type so a typed factory result (`AccountDraft`) passes without being
 * widened to `Record<string, unknown>` at the call site.
 */
export async function createRecord<T extends object>(
  org: ApiRequest,
  objectApiName: string,
  fields: T,
): Promise<CreateResponse> {
  const { data } = await org.post(SalesforceApi.sobject(objectApiName), {
    data: fields,
    schema: CreateResponseSchema,
    expectStatus: 201,
  });
  return data;
}

/** Update one record. Salesforce returns 204 with no body on success. */
export async function updateRecord<T extends object>(
  org: ApiRequest,
  objectApiName: string,
  recordId: string,
  fields: T,
): Promise<void> {
  await org.patch(SalesforceApi.sobjectById(objectApiName, recordId), {
    data: fields,
    expectStatus: 204,
  });
}

/**
 * Best-effort delete for teardown.
 *
 * Swallows errors on purpose: a cleanup failure must never overwrite the real assertion failure
 * that a test just reported. Note deletes go to the Recycle Bin and still consume storage — see
 * `salesforce-data` on hard delete for high-volume suites.
 */
export async function deleteRecordQuietly(
  org: ApiRequest,
  objectApiName: string,
  recordId: string,
): Promise<void> {
  await org.delete(SalesforceApi.sobjectById(objectApiName, recordId)).catch(() => {
    /* best-effort cleanup — see salesforce-data */
  });
}

/**
 * Create a parent + children hierarchy in ONE call (≤200 records, ≤5 levels).
 *
 * ⚠️ Asserts `hasErrors === false` because the outer HTTP status is 200 even when individual
 * records failed. Checking only the status is a false green.
 */
export async function createTree(
  org: ApiRequest,
  rootObjectApiName: string,
  records: unknown[],
): Promise<CompositeTreeResponse> {
  const { data } = await org.post(SalesforceApi.compositeTree(rootObjectApiName), {
    data: { records },
    schema: CompositeTreeResponseSchema,
    expectStatus: 200,
  });
  // Throws rather than `expect`, so this helper also works outside a test (scripts, fixtures,
  // global setup). `expect` outside a test context throws a confusing Playwright internal error.
  if (data.hasErrors) {
    throw new Error(
      `composite/tree reported errors creating ${rootObjectApiName}. The outer HTTP status was 200 — ` +
        `Salesforce reports per-record failures in the body:\n${JSON.stringify(data.results, null, 2)}`,
    );
  }
  return data;
}

/** Map `referenceId` → created record Id from a composite/tree response. */
export function treeIds(response: CompositeTreeResponse): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const result of response.results) {
    if (result.id !== undefined) ids[result.referenceId] = result.id;
  }
  return ids;
}

/**
 * One created Id from a composite/tree response, by `referenceId`.
 *
 * Throws rather than returning `string | undefined` so callers get a `string` and don't need a
 * conditional in the test body (or in teardown) to satisfy the type.
 */
export function treeId(response: CompositeTreeResponse, referenceId: string): string {
  const id = treeIds(response)[referenceId];
  if (id === undefined) {
    throw new Error(
      `composite/tree returned no Id for referenceId "${referenceId}". ` +
        `Results: ${JSON.stringify(response.results)}`,
    );
  }
  return id;
}

/**
 * Answer the SHARING question directly: can this user read/edit/delete this record?
 *
 * Distinct from FLS. A user can hold Read on Opportunity (CRUD/FLS) and still not see THIS
 * Opportunity (OWD, role hierarchy, sharing rules). See `salesforce-personas`.
 */
export async function recordAccessFor(
  org: ApiRequest,
  userId: string,
  recordId: string,
): Promise<UserRecordAccess | undefined> {
  const statement =
    `SELECT RecordId, HasReadAccess, HasEditAccess, HasDeleteAccess ` +
    `FROM ${SObjects.USER_RECORD_ACCESS} ` +
    `WHERE UserId = '${escapeSoql(userId)}' AND RecordId = '${escapeSoql(recordId)}'`;
  const rows = await soqlQuery(org, statement, UserRecordAccessSchema);
  return rows[0];
}

/**
 * The Id of the user this session is authenticated as.
 *
 * Uses the identity endpoint rather than SOQL — there is no SOQL expression for "me", and this is
 * the value you need to feed `recordAccessFor` when testing sharing.
 */
export async function currentUserId(org: ApiRequest): Promise<string> {
  const { data } = await org.get('/services/oauth2/userinfo', {
    schema: z.object({ user_id: z.string() }).catchall(z.unknown()),
    expectStatus: 200,
  });
  return data.user_id;
}

/**
 * Guard the org's daily API request limit before a write-heavy run.
 *
 * The daily limit is ORG-WIDE and shared with production integrations — exhausting it takes real
 * integrations down, not just your tests. This is the one Salesforce limit with blast radius beyond
 * the suite, so fail fast and loud rather than half-running. See `salesforce-data`.
 */
export async function assertApiLimitHeadroom(org: ApiRequest): Promise<void> {
  const { data } = await org.get(SalesforceApi.LIMITS, {
    schema: LimitsSchema,
    expectStatus: 200,
  });
  const { Max, Remaining } = data.DailyApiRequests;
  const threshold = Max * salesforceConfig.apiLimitAbortThreshold;
  if (Remaining < threshold) {
    throw new Error(
      `Aborting: org has only ${Remaining}/${Max} daily API requests remaining ` +
        `(threshold ${Math.round(threshold)}). This limit is shared with production integrations — ` +
        'do not burn it. Raise SF_API_LIMIT_THRESHOLD only if you know why.',
    );
  }
}

/** Prefix + unique suffix so test data is identifiable and duplicate rules don't fire. */
let sequence = 0;
export function uniqueName(base: string): string {
  sequence += 1;
  // Worker index keeps this collision-free across parallel workers; a bare timestamp is not
  // sufficient because two workers can land in the same millisecond. See `salesforce-data`.
  const worker = process.env.TEST_WORKER_INDEX ?? '0';
  return `${salesforceConfig.testDataPrefix}${base} w${worker}-${sequence}`;
}
