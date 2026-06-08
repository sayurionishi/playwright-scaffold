import { z } from 'zod';

/**
 * EXAMPLE response schemas. Mirror YOUR API's documented contract 1:1 (verify against OpenAPI).
 *
 *  - `z.strictObject` everywhere — an unexpected field fails the test (catches drift).
 *  - Export the schema AND the inferred type (`z.output`) so tests stay typed end to end.
 *  - Validate at runtime in the test: `expect(UserSchema.parse(body)).toBeTruthy()` — or pass
 *    the schema to `api.get(path, { schema: UserSchema })` and the fixture validates for you.
 */
export const UserSchema = z.strictObject({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  createdAt: z.string().datetime(),
});
export type User = z.output<typeof UserSchema>;

export const UserListSchema = z.strictObject({
  data: z.array(UserSchema),
  total: z.number().int().nonnegative(),
});
export type UserList = z.output<typeof UserListSchema>;
