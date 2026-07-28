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
import dotenv from 'dotenv';
import { request as playwrightRequest } from '@playwright/test';
import { ApiRequest } from '../fixtures/api/api-request';
import { getOrgSession, authHeaders } from '../helpers/salesforce/auth';
import { fetchDescribe, normalizeDescribe } from '../helpers/salesforce/describe';
import type { DescribeField } from '../fixtures/salesforce/schemas/describe.schema';
import { salesforceConfig } from '../config/salesforce.config';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
dotenv.config({ path: path.resolve(process.cwd(), `env/.env.${ENVIRONMENT}`) });

const OUTPUT_DIR = path.resolve(process.cwd(), 'fixtures/salesforce/schemas/generated');

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

function generateSchemaFile(objectApiName: string, fields: DescribeField[]): string {
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

function generateSnapshotFile(objectApiName: string, snapshot: unknown): string {
  return `// GENERATED FILE — do not edit by hand.
//
// Regenerate with:  npm run sf:schemas -- ${objectApiName}
//
// The normalized metadata snapshot the @contract drift test compares the live org against.
// See tests/salesforce/metadata-contract.spec.ts and the \`salesforce-metadata-contract\` skill.

import type { ObjectSnapshot } from '../describe.schema';

export const ${objectApiName}Snapshot: ObjectSnapshot = ${JSON.stringify(snapshot, null, 2)} as const;
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
      const snapshot = normalizeDescribe(describe);

      const schemaPath = path.join(OUTPUT_DIR, `${objectApiName.toLowerCase()}.schema.ts`);
      const snapshotPath = path.join(OUTPUT_DIR, `${objectApiName.toLowerCase()}.snapshot.ts`);

      fs.writeFileSync(schemaPath, generateSchemaFile(objectApiName, describe.fields), 'utf8');
      fs.writeFileSync(snapshotPath, generateSnapshotFile(objectApiName, snapshot), 'utf8');

      console.warn(
        `✓ ${objectApiName}: ${describe.fields.length} fields → ` +
          `${path.relative(process.cwd(), schemaPath)} + snapshot`,
      );
    }

    console.warn(
      '\nReview the diff like code, then COMMIT the generated files — they are your drift snapshot.',
    );
  } finally {
    await context.dispose();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
