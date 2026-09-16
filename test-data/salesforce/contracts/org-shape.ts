/**
 * THE ORG-SHAPE PRE-FLIGHT — the org configuration this suite REQUIRES in order to be meaningful.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A TEST AND NOT A RUNBOOK
 *
 * Record types, picklist values and page layouts differ per sandbox, and a sandbox refresh wipes
 * whatever was configured by hand. When the org is not shaped the way the suite assumes, you do
 * not get one clear failure — you get forty mysterious UI failures whose messages are all about
 * locators, and an afternoon spent debugging Playwright for what is an org-configuration problem.
 *
 * `docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md` covers the same ground as a human checklist. A
 * checklist is strictly weaker: it goes stale silently, nobody re-runs it after a refresh, and it
 * cannot tell you WHICH item broke. This is the programmatic version — it fails fast, once, and
 * names the missing config.
 *
 * Run it first: `npm run test:contract`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ SHIPPED EMPTY ON PURPOSE. Every value here is ORG STATE (Constitution #15) — inventing a
 * record-type name or a picklist value would be exactly the guess the rules forbid, and a wrong
 * default is worse than no default because it produces a confident failure. Populate it from your
 * own org:
 *
 *     npm run sf:schemas -- Account Opportunity     # prints types, picklist values, record types
 *
 * Until you do, the pre-flight reports that it is unconfigured rather than passing vacuously.
 */

export interface RequiredRecordType {
  /** sObject API name, e.g. 'Account'. */
  object: string;
  /** Record type DEVELOPER name (not the label — labels are translated). */
  developerName: string;
  /** Why the suite needs it. Shown in the failure message, so make it actionable. */
  because: string;
}

export interface RequiredPicklistValues {
  object: string;
  /** Field API name, e.g. 'StageName'. */
  field: string;
  /**
   * Values the suite depends on. These are the ones a test USES — not every value in the org, so
   * adding a new value to the picklist does not fail this. A removed or renamed one does.
   */
  values: readonly string[];
  because: string;
}

export interface OrgShapeContract {
  recordTypes: readonly RequiredRecordType[];
  picklists: readonly RequiredPicklistValues[];
}

/**
 * EXAMPLE, commented out rather than filled in — see the warning above.
 *
 * const ORG_SHAPE: OrgShapeContract = {
 *   recordTypes: [
 *     {
 *       object: 'Account',
 *       developerName: 'PersonAccount',
 *       because: 'The consumer journey tests arrange person accounts (see salesforce-data).',
 *     },
 *   ],
 *   picklists: [
 *     {
 *       object: 'Opportunity',
 *       field: 'StageName',
 *       values: ['Prospecting', 'Closed Won'],
 *       because: 'makeOpportunity() requires a real stage; the pipeline test asserts Closed Won.',
 *     },
 *   ],
 * };
 */
export const ORG_SHAPE: OrgShapeContract = {
  recordTypes: [],
  picklists: [],
};

/** True when nothing has been declared yet — drives the "unconfigured" guard in the spec. */
export const ORG_SHAPE_IS_EMPTY =
  ORG_SHAPE.recordTypes.length === 0 && ORG_SHAPE.picklists.length === 0;
