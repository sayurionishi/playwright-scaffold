/**
 * Lightning Experience UI routes — single source of truth for navigation.
 *
 * These path SHAPES are documented Salesforce platform routes and are safe to rely on. The
 * `objectApiName` you pass into them is org state — read it from `describe`, never from memory
 * (Constitution #15).
 *
 * All routes are relative to BASE_URL, which for Salesforce is your Lightning host
 * (e.g. https://acme--uat.sandbox.lightning.force.com). Note this is a DIFFERENT host from the
 * instance URL used for API calls — see `salesforce-auth`.
 */

export const LightningRoutes = {
  /** The Lightning home page. */
  HOME: '/lightning/page/home',

  /** Setup — do NOT automate this UI. Here only so tests can assert it's unreachable. */
  SETUP: '/lightning/setup/SetupOneHome/home',
} as const;

/** A record's detail page: /lightning/r/Account/001.../view */
export function recordView(objectApiName: string, recordId: string): string {
  return `/lightning/r/${objectApiName}/${recordId}/view`;
}

/** A record's edit page. */
export function recordEdit(objectApiName: string, recordId: string): string {
  return `/lightning/r/${objectApiName}/${recordId}/edit`;
}

/** An object's list view: /lightning/o/Account/list?filterName=Recent */
export function objectList(objectApiName: string, filterName = 'Recent'): string {
  return `/lightning/o/${objectApiName}/list?filterName=${encodeURIComponent(filterName)}`;
}

/** The new-record page for an object. */
export function objectNew(objectApiName: string): string {
  return `/lightning/o/${objectApiName}/new`;
}

/** A Lightning app: /lightning/app/standard__LightningSales */
export function app(appDeveloperName: string): string {
  return `/lightning/app/${appDeveloperName}`;
}

/**
 * Regex matching a record view URL, for `page.waitForURL`. Accepts 15- or 18-char Ids.
 *
 * Client-side routing means the URL settles BEFORE the record data arrives — pair this with
 * `waitForRecordLoad`, don't use it alone. See `salesforce-waits`.
 */
export function recordViewPattern(objectApiName: string): RegExp {
  return new RegExp(`/lightning/r/${objectApiName}/[a-zA-Z0-9]{15,18}/view`);
}

/** Extract the record Id from a Lightning record URL, or null if it isn't one. */
export function recordIdFromUrl(url: string): string | null {
  return /\/lightning\/r\/[^/]+\/([a-zA-Z0-9]{15,18})\//.exec(url)?.[1] ?? null;
}
