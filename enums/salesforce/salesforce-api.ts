/**
 * Salesforce REST API paths — single source of truth.
 *
 * All paths are versioned via `dataPath()` from config, so bumping SF_API_VERSION moves every
 * call at once. Never build these by string concatenation in a test.
 *
 * Unlike `enums/util/api-endpoints.ts`, these are NOT examples — they are documented, stable
 * Salesforce platform paths. What you must never write from memory is the *object and field
 * API names* that go into them (Constitution #15) — those come from `describe`.
 */

import { dataPath, salesforceConfig } from '../../config/salesforce.config';

export const SalesforceApi = {
  /** All API versions the org supports. Unversioned by design — used to assert the pin. */
  VERSIONS: '/services/data/',

  /** Org limits, including DailyApiRequests. See `salesforce-data`. */
  get LIMITS(): string {
    return dataPath('limits');
  },

  /** SOQL query. Pass the statement as the `q` query param. */
  get QUERY(): string {
    return dataPath('query');
  },

  /** Composite: up to 25 subrequests, ordered, able to reference each other's results. */
  get COMPOSITE(): string {
    return dataPath('composite');
  },

  /** Composite batch: up to 25 INDEPENDENT subrequests (no chaining). */
  get COMPOSITE_BATCH(): string {
    return dataPath('composite/batch');
  },

  /** Composite graph: multiple graphs, each all-or-nothing. */
  get COMPOSITE_GRAPH(): string {
    return dataPath('composite/graph');
  },

  /** Bulk API 2.0 ingest jobs (async — poll the job, never sleep). */
  get BULK_INGEST(): string {
    return dataPath('jobs/ingest');
  },

  /** Collection endpoint for an object: POST to create, GET for basic info. */
  sobject(objectApiName: string): string {
    return dataPath(`sobjects/${objectApiName}`);
  },

  /** A single record: GET / PATCH / DELETE. */
  sobjectById(objectApiName: string, recordId: string): string {
    return dataPath(`sobjects/${objectApiName}/${recordId}`);
  },

  /** Full field metadata for an object, org-wide. The schema-generation source. */
  describe(objectApiName: string): string {
    return dataPath(`sobjects/${objectApiName}/describe`);
  },

  /**
   * Object metadata AS THE CALLING USER SEES IT — resolves profile + permission sets + muting.
   * This is the FLS/permission oracle, not `describe`. See `salesforce-personas`.
   */
  objectInfo(objectApiName: string): string {
    return dataPath(`ui-api/object-info/${objectApiName}`);
  },

  /** UI API record read/update — also the deterministic wait target. See `salesforce-waits`. */
  uiRecord(recordId: string): string {
    return dataPath(`ui-api/records/${recordId}`);
  },

  /** UI API record create. */
  get UI_RECORDS(): string {
    return dataPath('ui-api/records');
  },

  /** Create a parent + children hierarchy in one call (≤200 records, ≤5 levels). */
  compositeTree(objectApiName: string): string {
    return dataPath(`composite/tree/${objectApiName}`);
  },

  /**
   * sObject Collections — create/update/delete up to 200 records in one call.
   * Note: returns 200 with per-record success flags; check every one.
   */
  get COMPOSITE_SOBJECTS(): string {
    return dataPath('composite/sobjects');
  },

  /** Custom Apex REST endpoint. `path` is whatever @RestResource urlMapping declares. */
  apexRest(path: string): string {
    return `/services/apexrest${path.startsWith('/') ? path : `/${path}`}`;
  },
} as const;

/**
 * URL fragments used to pre-register Lightning waits. These are matched as substrings against
 * response URLs, so they deliberately omit the version prefix. See `helpers/salesforce/lightning.ts`.
 */
export const UiApiFragments = {
  RECORDS: 'ui-api/records',
  OBJECT_INFO: 'ui-api/object-info',
  LIST_RECORDS: 'ui-api/list-records',
  LIST_INFO: 'ui-api/list-info',
  LOOKUPS: 'ui-api/lookups',
  RECORD_UI: 'ui-api/record-ui',
} as const;

export type UiApiFragment = (typeof UiApiFragments)[keyof typeof UiApiFragments];

/** Build the SOQL query URL with the statement attached. */
export function soqlUrl(statement: string): string {
  return `${SalesforceApi.QUERY}?q=${encodeURIComponent(statement)}`;
}

/**
 * True when `id` is a syntactically valid Salesforce Id (15 or 18 characters, alphanumeric).
 *
 * Syntax only — it cannot tell you the record exists, nor that it's the right object type.
 * The 3-character key prefix does that: `001` Account, `003` Contact, `006` Opportunity, and
 * custom objects get an org-assigned prefix you must read from `describe`, never assume.
 */
export function isValidSalesforceId(id: string): boolean {
  return /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(id);
}

/** The org's instance host, derived from a session's instance URL. */
export function instanceHost(instanceUrl: string): string {
  return new URL(instanceUrl).hostname;
}

/** Current pinned version as a bare number string, e.g. '62.0'. */
export function pinnedVersionNumber(): string {
  return salesforceConfig.apiVersion.replace(/^v/, '');
}
