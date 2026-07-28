/**
 * sObject API names and Salesforce error codes.
 *
 * ── WHAT BELONGS HERE ───────────────────────────────────────────────────────────────────────
 * STANDARD object names below are documented platform constants — safe to rely on.
 *
 * CUSTOM objects and ALL custom fields are ORG STATE. Constitution #15: read them from
 * `describe`, never write them from memory. `Invoice__c` existing in one org proves nothing
 * about yours, and a managed-package object carries a namespace that differs per install
 * (`acme__Widget__c`).
 *
 * So: add your org's custom objects here only AFTER confirming them against `describe` — and
 * prefer generated schemas (`npm run sf:schemas`) as the real source of truth for field names.
 */

export const SObjects = {
  ACCOUNT: 'Account',
  CONTACT: 'Contact',
  LEAD: 'Lead',
  OPPORTUNITY: 'Opportunity',
  CASE: 'Case',
  TASK: 'Task',
  EVENT: 'Event',
  USER: 'User',
  PROFILE: 'Profile',
  PERMISSION_SET: 'PermissionSet',
  PERMISSION_SET_ASSIGNMENT: 'PermissionSetAssignment',
  /** Answers "can THIS user access THIS record?" — the sharing oracle. See `salesforce-personas`. */
  USER_RECORD_ACCESS: 'UserRecordAccess',
  RECORD_TYPE: 'RecordType',
} as const;

export type SObjectName = (typeof SObjects)[keyof typeof SObjects];

/**
 * Salesforce API error codes worth asserting on.
 *
 * The distinctions that matter for permission testing (see `salesforce-personas`):
 *  - Missing OBJECT access → 403 INSUFFICIENT_ACCESS (explicit)
 *  - Missing RECORD access → 404 NOT_FOUND (deliberately indistinguishable from "doesn't exist";
 *    Salesforce hides existence so it can't be probed)
 *  - Missing FIELD access on read → the field is SILENTLY OMITTED from the response. No error at
 *    all. This is why `z.strictObject` is your FLS assertion mechanism.
 */
export const SalesforceErrorCodes = {
  /** Object-level CRUD denied. */
  INSUFFICIENT_ACCESS: 'INSUFFICIENT_ACCESS',
  INSUFFICIENT_ACCESS_OR_READONLY: 'INSUFFICIENT_ACCESS_OR_READONLY',
  /** Field-level security denied on create/update. */
  INVALID_FIELD_FOR_INSERT_UPDATE: 'INVALID_FIELD_FOR_INSERT_UPDATE',
  /** A validation rule fired — the most common "your config works" assertion. */
  FIELD_CUSTOM_VALIDATION_EXCEPTION: 'FIELD_CUSTOM_VALIDATION_EXCEPTION',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  /** A Duplicate Rule blocked the insert — see `salesforce-data` on unique naming. */
  DUPLICATES_DETECTED: 'DUPLICATES_DETECTED',
  /** Row lock contention — usually parallel workers touching the same parent record. */
  UNABLE_TO_LOCK_ROW: 'UNABLE_TO_LOCK_ROW',
  /** Governor limit hit. A BUG in the code under test, never a test to retry. */
  LIMIT_EXCEEDED: 'LIMIT_EXCEEDED',
  MALFORMED_ID: 'MALFORMED_ID',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_FIELD: 'INVALID_FIELD',
  ENTITY_IS_DELETED: 'ENTITY_IS_DELETED',
} as const;

export type SalesforceErrorCode = (typeof SalesforceErrorCodes)[keyof typeof SalesforceErrorCodes];

/**
 * Standard object key prefixes (first 3 chars of a record Id). Useful for asserting that an Id
 * belongs to the object you expect — a real class of bug when Ids are passed around.
 *
 * CUSTOM objects get an org-assigned prefix. Read it from `describe` (`keyPrefix`); do not guess.
 */
export const KeyPrefixes = {
  ACCOUNT: '001',
  CONTACT: '003',
  OPPORTUNITY: '006',
  LEAD: '00Q',
  CASE: '500',
  USER: '005',
  TASK: '00T',
} as const;
