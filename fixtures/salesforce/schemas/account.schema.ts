import { z } from 'zod';
import { SObjectAttributesSchema } from './salesforce-common.schema';

/**
 * EXAMPLE narrow read-back schemas for Account.
 *
 * ⚠️ WHY THESE ARE NARROW, AND WHY THE REQUEST MUST PASS `fields`.
 *
 * A bare `GET /sobjects/Account/{id}` returns EVERY field the running user can see — which is
 * org-specific and changes whenever an admin adds a field. A `z.strictObject` over that would fail
 * on the extra keys, so pair each schema with `params: { fields: '…' }` on the request and keep the
 * two in step. Narrowing is not just about payload size here: it is what makes strict validation
 * possible at all, and strictness is what turns a silently-omitted field (FLS!) into a failure.
 *
 * Replace these with the generated per-object schemas (`npm run sf:schemas`) once you have run the
 * generator against your own org — see `salesforce-metadata-contract`.
 */
export const AccountPhoneSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  Phone: z.string().nullable(),
});

export type AccountPhone = z.infer<typeof AccountPhoneSchema>;
