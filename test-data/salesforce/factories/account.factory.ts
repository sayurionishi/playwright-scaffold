import { faker } from '@faker-js/faker';
import { uniqueName } from '../../../helpers/salesforce/soql';

/**
 * Salesforce record factories — dynamic happy-path drafts (`data-strategy`, `salesforce-data`).
 *
 * ── ONLY STANDARD FIELDS ARE USED HERE ──────────────────────────────────────────────────────
 * Every field below is a documented STANDARD Salesforce field. Custom fields (`__c`) are ORG
 * STATE — Constitution #15 forbids writing them from memory. Add them to these factories only
 * after confirming them via `npm run sf:schemas` / `describe`.
 *
 * ── WHY uniqueName() ────────────────────────────────────────────────────────────────────────
 * Most real orgs run Duplicate Rules on Account, Contact, and Lead. A factory returning a fixed
 * "Acme Corp" fails with DUPLICATES_DETECTED on the second run — or worse, silently trips a Flow.
 * `uniqueName` also applies TEST_PREFIX so a human can find and purge orphans with one list-view
 * filter, which matters because orphaned data WILL accumulate in a shared sandbox.
 */

export interface AccountDraft {
  Name: string;
  Type?: string;
  Industry?: string;
  Phone?: string;
  Website?: string;
  BillingCity?: string;
  BillingCountry?: string;
}

/**
 * @param overrides pin specific fields; everything else is randomized
 * @param seed make the call reproducible when a test needs determinism
 */
export function makeAccount(overrides: Partial<AccountDraft> = {}, seed?: number): AccountDraft {
  if (seed !== undefined) faker.seed(seed);
  return {
    Name: uniqueName(faker.company.name()),
    Phone: faker.phone.number(),
    Website: faker.internet.url(),
    BillingCity: faker.location.city(),
    BillingCountry: faker.location.country(),
    ...overrides,
  };
}

export interface ContactDraft {
  LastName: string;
  FirstName?: string;
  Email?: string;
  Phone?: string;
  Title?: string;
  AccountId?: string;
}

/** `LastName` is the only required field on Contact — everything else is optional. */
export function makeContact(overrides: Partial<ContactDraft> = {}, seed?: number): ContactDraft {
  if (seed !== undefined) faker.seed(seed);
  return {
    FirstName: faker.person.firstName(),
    LastName: uniqueName(faker.person.lastName()),
    Email: faker.internet.email().toLowerCase(),
    Phone: faker.phone.number(),
    Title: faker.person.jobTitle(),
    ...overrides,
  };
}

export interface OpportunityDraft {
  Name: string;
  /** ⚠️ StageName values are ORG-CONFIGURABLE. Read valid values from `describe`, don't assume. */
  StageName: string;
  /** ISO date (YYYY-MM-DD). */
  CloseDate: string;
  Amount?: number;
  AccountId?: string;
}

/**
 * ⚠️ `StageName` has NO safe default. The picklist is org-configurable — "Prospecting" is the
 * out-of-the-box first value but an org can rename or remove it. Pass a value your org actually
 * has (read it from `describe`, or from the generated schema's enum).
 */
export function makeOpportunity(
  stageName: string,
  overrides: Partial<OpportunityDraft> = {},
  seed?: number,
): OpportunityDraft {
  if (seed !== undefined) faker.seed(seed);
  return {
    Name: uniqueName(`${faker.company.buzzNoun()} deal`),
    StageName: stageName,
    CloseDate: futureDateIso(30),
    Amount: faker.number.int({ min: 1_000, max: 500_000 }),
    ...overrides,
  };
}

/**
 * An ISO date N days from now.
 *
 * Relative rather than fixed because validation rules commonly require a future Close Date — a
 * hardcoded date silently starts failing the day it goes stale.
 */
export function futureDateIso(daysFromNow: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

/**
 * A `composite/tree` payload creating an Account with Contacts in ONE call.
 *
 * `referenceId` binds children to their parent and maps the response back to what you created.
 * See `salesforce-data`.
 */
export function makeAccountTree(contactCount = 2): { records: unknown[] } {
  return {
    records: [
      {
        attributes: { type: 'Account', referenceId: 'acct1' },
        ...makeAccount(),
        Contacts: {
          records: Array.from({ length: contactCount }, (_unused, index) => ({
            attributes: { type: 'Contact', referenceId: `con${index + 1}` },
            ...makeContact(),
          })),
        },
      },
    ],
  };
}
