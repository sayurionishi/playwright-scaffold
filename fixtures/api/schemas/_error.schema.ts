import { z } from 'zod';

/**
 * Shared error-envelope schema, reused for 400 / 401 / 403 / 404 / 409 / 422 responses.
 * Adjust the shape to match YOUR API's documented error contract (verify against OpenAPI).
 *
 * Always `z.strictObject` (never `z.object`) so an unexpected/extra field fails the test
 * instead of passing silently — schema drift is a signal, not noise.
 */
export const ErrorResponseSchema = z.strictObject({
  detail: z.union([
    z.string(),
    z.strictObject({ message: z.string() }),
    z.array(
      z.strictObject({
        loc: z.array(z.union([z.string(), z.number()])),
        msg: z.string(),
        type: z.string(),
      }),
    ),
  ]),
});

export type ErrorResponse = z.output<typeof ErrorResponseSchema>;
