/**
 * Generate Zod schemas + contract snapshots from a Salesforce org's `describe` metadata.
 *
 *   npm run sf:schemas -- Account Contact Opportunity
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Salesforce ships no OpenAPI document, so `describe` IS the API contract. And because that
 * metadata is ORG STATE rather than committed source, it changes the moment an admin clicks Save —
 * no deploy, no PR, no notification.
 *
 * Generating (never hand-writing) these schemas does two things:
 *   1. Satisfies Constitution #15 — field API names come from the org, never from memory.
 *   2. Makes the committed output a SNAPSHOT. Re-run this script and `git diff` IS your drift
 *      report. The `@contract` test then fails loudly on one test instead of mysteriously on forty.
 *
 * Generated files ARE COMMITTED. That's the point.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { format as prettierFormat, resolveConfig as resolvePrettierConfig } from 'prettier';
import { request as playwrightRequest } from '@playwright/test';
import { ApiRequest } from '../fixtures/api/api-request';
import { getOrgSession, authHeaders } from '../helpers/salesforce/auth';
import { fetchDescribe, normalizeDescribe } from '../helpers/salesforce/describe';
import type { DescribeField, ObjectSnapshot } from '../fixtures/salesforce/schemas/describe.schema';
import { salesforceConfig } from '../config/salesforce.config';

// This must stay a raw inline read, matching playwright.config.ts: it decides which env/.env.<name>
// file to load, so it can't itself depend on salesforceConfig (which needs that file loaded first).
const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
dotenv.config({ path: path.resolve(process.cwd(), `env/.env.${ENVIRONMENT}`) });

const OUTPUT_DIR = path.resolve(process.cwd(), 'fixtures/salesforce/schemas/generated');

/**
 * Run generated source through the project's own Prettier config before writing it.
 *
 * Avoids hand-rolled indentation logic for the generated object literals (`JSON.stringify` alone
 * produces valid but not necessarily project-styled TS) — Prettier does the reformatting correctly
 * regardless of nesting depth, and the output matches whatever a human-authored file would look
 * like, which is what `lint-staged`/CI expect anyway.
 *
 * ⚠️ `resolveConfig` needs a FILE path to search upward from, not a bare directory — verified
 * directly: `resolveConfig(process.cwd())` silently returns `null` (so every generated file quietly
 * fell back to Prettier's un-configured defaults, e.g. double quotes instead of this project's
 * `singleQuote: true`), while `resolveConfig(path.join(process.cwd(), 'x.ts'))` finds
 * `.prettierrc.json` correctly. Pass the REAL target path so config lookup also respects any
 * nested/per-directory Prettier overrides, not just the repo root.
 */
export async function formatGenerated(source: string, targetPath: string): Promise<string> {
  const config = await resolvePrettierConfig(targetPath);
  return prettierFormat(source, { ...config, parser: 'typescript' });
}

/** Quote a string for embedding in generated TypeScript. */
function quote(value: string): string {
  return JSON.stringify(value);
}

/**
 * Map a Salesforce field type to a Zod expression.
 *
 * Two mappings earn their keep specifically:
 *  - `picklist` → `z.enum([...])`, so an admin adding/removing a value fails the contract test.
 *    That's usually a genuine break, since Apex and Flows branch on those values.
 *  - textual types → `.max(length)`, so a shortened field is a caught change rather than a
 *    silent truncation bug in production.
 */
function zodForField(field: DescribeField): string {
  const activeValues = field.picklistValues.filter((value) => value.active).map((v) => v.value);

  let expression: string;
  switch (field.type) {
    case 'id':
    case 'reference':
      expression = 'SalesforceIdSchema';
      break;
    case 'boolean':
      expression = 'z.boolean()';
      break;
    case 'int':
      expression = 'z.number().int()';
      break;
    case 'double':
    case 'currency':
    case 'percent':
      expression = 'z.number()';
      break;
    case 'date':
      expression = 'z.string()';
      break;
    case 'datetime':
      expression = 'z.string().datetime()';
      break;
    case 'email':
      expression = 'z.string().email()';
      break;
    case 'url':
      expression = 'z.string().url()';
      break;
    case 'picklist':
      // An empty picklist would make z.enum([]) invalid TypeScript — fall back to string.
      expression =
        activeValues.length > 0 ? `z.enum([${activeValues.map(quote).join(', ')}])` : 'z.string()';
      break;
    case 'multipicklist':
      // Multipicklists arrive as a single semicolon-delimited string, not an array.
      expression = 'z.string()';
      break;
    case 'textarea':
    case 'string':
    case 'phone':
    case 'picklist_multi':
      expression = field.length > 0 ? `z.string().max(${field.length})` : 'z.string()';
      break;
    default:
      // Unknown//new Salesforce types: stay permissive on shape but keep the field guarded.
      expression = 'z.unknown()';
      break;
  }

  if (field.nillable && expression !== 'z.unknown()') expression += '.nullable()';
  return expression;
}

export function generateSchemaFile(objectApiName: string, fields: DescribeField[]): string {
  const lines = fields
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((field) => `  ${field.name}: ${zodForField(field)},`);

  return `// GENERATED FILE — do not edit by hand.
//
// Regenerate with:  npm run sf:schemas -- ${objectApiName}
//
// This file is the committed CONTRACT SNAPSHOT for ${objectApiName}. A \`git diff\` here after
// regenerating is your metadata-drift report. If the @contract test fails, DO NOT hand-edit this
// file to make it pass — triage the change per the \`salesforce-metadata-contract\` skill.
//
// Source: ${salesforceConfig.apiVersion} sobjects/${objectApiName}/describe

import { z } from 'zod';
import {
  SalesforceIdSchema,
  SObjectAttributesSchema,
} from '../salesforce-common.schema';

/**
 * Every field on ${objectApiName}, as the org defines it.
 *
 * \`strictObject\` (Constitution #6): an unexpected field means drift. On a persona-scoped request
 * it can also mean an FLS regression — see \`salesforce-personas\`.
 */
export const ${objectApiName}FieldsSchema = z.strictObject({
${lines.join('\n')}
});
export type ${objectApiName}Fields = z.output<typeof ${objectApiName}FieldsSchema>;

/**
 * A queried ${objectApiName} record: the \`attributes\` envelope plus a SUBSET of fields.
 *
 * SOQL has no \`SELECT *\`, so a query returns only what you asked for. Build a per-query schema by
 * picking from the full field schema:
 *
 *   const Slim = ${objectApiName}RecordSchema(${objectApiName}FieldsSchema.pick({ Id: true, Name: true }));
 */
export function ${objectApiName}RecordSchema<T extends z.ZodRawShape>(fields: z.ZodObject<T>) {
  return z.strictObject({ attributes: SObjectAttributesSchema }).merge(fields);
}
`;
}

/**
 * Read the CURRENTLY COMMITTED snapshot map out of a previously generated file, so regenerating one
 * environment's entry doesn't clobber every other environment's.
 *
 * The script runs under `tsx`, whose whole job is executing TypeScript directly — so this dynamic
 * `import()` of a generated `.ts` file works exactly like `import()` of any other module, no special
 * loader needed. A `file://` URL is used (via `pathToFileURL`) because a bare absolute filesystem
 * path is not a valid ESM import specifier on every platform (notably Windows).
 *
 * ⚠️ CACHE-BUSTED ON PURPOSE. Node's ESM loader caches a module by its resolved URL for the life of
 * the process, so importing the SAME path twice returns the FIRST result even after the file on
 * disk changed — verified directly: a harness that wrote "dev", read it back, then wrote "staging"
 * merged with it, got back only "dev" on the next read without this. A `?t=` query param makes each
 * call a distinct specifier, forcing a real re-read. Harmless overhead — this only ever runs a
 * handful of times per script invocation.
 */
export async function loadExistingSnapshotMap(
  snapshotPath: string,
  exportName: string,
): Promise<Partial<Record<string, ObjectSnapshot>>> {
  if (!fs.existsSync(snapshotPath)) return {};
  try {
    const moduleUrl = `${pathToFileURL(snapshotPath).href}?t=${process.hrtime.bigint()}`;
    const loaded = (await import(moduleUrl)) as Record<string, unknown>;
    const existing = loaded[exportName];
    return typeof existing === 'object' && existing !== null
      ? (existing as Partial<Record<string, ObjectSnapshot>>)
      : {};
  } catch (error) {
    console.warn(
      `⚠️  Could not read the existing snapshot at ${path.relative(process.cwd(), snapshotPath)} to ` +
        `merge environments (${error instanceof Error ? error.message : String(error)}). Starting ` +
        'fresh — any OTHER environments already committed there will be OVERWRITTEN. Review the ' +
        'diff carefully before committing.',
    );
    return {};
  }
}

/**
 * Generate the snapshot file's source, MERGING this environment's fresh snapshot into whatever was
 * already committed for other environments.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS KEYED BY ENVIRONMENT
 *
 * Dev and staging sandboxes routinely have different metadata shapes — an unrefreshed sandbox, a
 * field that landed in dev but hasn't been deployed to staging yet, a picklist value added in one
 * org only. A single committed snapshot per OBJECT would make the drift test fail on one of your
 * environments no matter which one you generated it from — a false failure, not real drift.
 *
 * Keying by environment means regenerating dev's entry never touches staging's, and the drift test
 * always compares each environment against ITS OWN last-known-good shape.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export function generateSnapshotFile(
  objectApiName: string,
  environment: string,
  snapshotForThisEnv: ObjectSnapshot,
  existingByEnv: Partial<Record<string, ObjectSnapshot>>,
): string {
  const merged = { ...existingByEnv, [environment]: snapshotForThisEnv };
  const sortedEntries = Object.keys(merged)
    .sort()
    .map((env) => `  ${JSON.stringify(env)}: ${JSON.stringify(merged[env])},`)
    .join('\n');

  return `// GENERATED FILE — do not edit by hand.
//
// Regenerate ONLY the current environment's entry with:
//   ENVIRONMENT=${environment} npm run sf:schemas -- ${objectApiName}
// (ENVIRONMENT defaults to 'dev' if unset — see env/.env.<environment>.)
//
// This file is READ BACK AND MERGED on every run (see loadExistingSnapshotMap in
// scripts/generate-sobject-schemas.ts), so regenerating one environment's entry never overwrites
// another's. Committed environments here: ${Object.keys(merged).sort().join(', ')}.
//
// The normalized metadata snapshot the @contract drift test compares the live org against, one
// entry per environment. See tests/salesforce/contract/metadata-drift.spec.ts and the
// \`salesforce-metadata-contract\` skill.
//
// A \`git diff\` after regenerating is your metadata-drift report FOR THAT ENVIRONMENT. If the
// @contract test fails, DO NOT hand-edit this file to make it pass — triage the change per the
// \`salesforce-metadata-contract\` skill.

import type { ObjectSnapshot } from '../describe.schema';

export const ${objectApiName}SnapshotByEnv: Partial<Record<string, ObjectSnapshot>> = {
${sortedEntries}
};
`;
}

async function main(): Promise<void> {
  const objectNames = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (objectNames.length === 0) {
    console.error(
      'Usage: npm run sf:schemas -- <Object> [<Object>...]\n' +
        'Example: npm run sf:schemas -- Account Contact Opportunity',
    );
    process.exit(1);
  }

  /**
   * ADMIN persona, deliberately — not the default/subject persona.
   *
   * `describe` read as a restricted user OMITS fields that user cannot see. Generating the schema
   * as the subject would bake an FLS-filtered view in as "the contract": the snapshot would be
   * silently incomplete, and it would never match `field-contract.spec.ts`, which reads as admin.
   */
  const session = await getOrgSession(salesforceConfig.adminPersona);
  const context = await playwrightRequest.newContext({
    baseURL: session.instanceUrl,
    extraHTTPHeaders: authHeaders(session),
  });

  try {
    const org = new ApiRequest(context, session.instanceUrl);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    for (const objectApiName of objectNames) {
      const describe = await fetchDescribe(org, objectApiName);
      const snapshotForThisEnv = normalizeDescribe(describe);

      const schemaPath = path.join(OUTPUT_DIR, `${objectApiName.toLowerCase()}.schema.ts`);
      const snapshotPath = path.join(OUTPUT_DIR, `${objectApiName.toLowerCase()}.snapshot.ts`);
      const exportName = `${objectApiName}SnapshotByEnv`;

      // Read what's already committed for OTHER environments before overwriting the file.
      const existingByEnv = await loadExistingSnapshotMap(snapshotPath, exportName);

      const schemaSource = await formatGenerated(
        generateSchemaFile(objectApiName, describe.fields),
        schemaPath,
      );
      const snapshotSource = await formatGenerated(
        generateSnapshotFile(objectApiName, ENVIRONMENT, snapshotForThisEnv, existingByEnv),
        snapshotPath,
      );

      fs.writeFileSync(schemaPath, schemaSource, 'utf8');
      fs.writeFileSync(snapshotPath, snapshotSource, 'utf8');

      const envCount = new Set([...Object.keys(existingByEnv), ENVIRONMENT]).size;
      console.warn(
        `✓ ${objectApiName} [${ENVIRONMENT}]: ${describe.fields.length} fields → ` +
          `${path.relative(process.cwd(), schemaPath)} + snapshot (${envCount} environment(s) committed)`,
      );
    }

    console.warn(
      `\nReview the diff like code, then COMMIT the generated files — they are your drift snapshot ` +
        `for "${ENVIRONMENT}". Run again with ENVIRONMENT=<other> to add another environment's entry.`,
    );
  } finally {
    await context.dispose();
  }
}

// Only run as the CLI entry point — guarded so the pure functions above can be imported and
// exercised directly (e.g. by a script validating the merge logic) without triggering a live run.
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
