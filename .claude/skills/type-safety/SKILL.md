---
name: type-safety
description: Use when writing or refactoring a Zod schema, converting an `any` to a real type, or designing typed request/response contracts. Enforces strict typing and runtime validation.
---

# Type Safety

The type system is load-bearing here. `any` is banned (ESLint error). Runtime validation backs the
compile-time types so contract drift surfaces as a test failure, not a silent pass.

## Zod schemas

- **`z.strictObject` always**, never `z.object`. Strict mode fails on unexpected fields — that's the point: an undocumented field is drift you want to catch.
- Use precise validators: `z.string().uuid()`, `z.string().email()`, `z.string().datetime()`, `z.number().int()`, `z.enum([...])`.
- **Export the schema AND the inferred type:** `export type User = z.output<typeof UserSchema>`.
- Repeated envelope across 3+ schemas → extract (`_envelope.ts`, `_error.schema.ts`).
- Schemas live in `fixtures/api/schemas/{area}/`.

## Validate at runtime

Every API response body is validated:

```ts
const { data } = await api.get(path, { schema: UserSchema }); // throws on drift; data is typed
// or explicitly:
expect(UserSchema.parse(body)).toBeTruthy();
```

Type generics alone are NOT enough — they're erased at runtime. The `.parse()` is what catches drift.

## Killing `any`

- External/unknown input → type as `unknown`, then narrow (schema parse, type guard).
- Function signatures get explicit param + return types.
- Prefer `interface` for object shapes, `type` for unions/utilities.
- `process.env.X` is `string | undefined` — handle with `??` fallback or the `required()` helper in `config/app.config.ts`. Never `as string` to silence it.

## Drift is a bug, not a fix

If the live response disagrees with the documented contract, **file it** (`test.skip` + `// FIXME`).
Never widen the schema (`.passthrough()`, `.optional()` everywhere, `z.any()`) to make red go green.
