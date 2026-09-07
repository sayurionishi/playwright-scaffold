import { Faker, en, faker as sharedFaker } from '@faker-js/faker';

/**
 * Resolve the Faker instance a factory should use.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
 *
 * Every factory used to do this:
 *
 *     if (seed !== undefined) faker.seed(seed);      // ❌
 *
 * `faker` is a MODULE-GLOBAL singleton, so seeding it is not scoped to the caller — it re-seeds
 * the generator for every subsequent factory call in that worker process. One test asking for
 * reproducibility therefore made every LATER test deterministic too, and two tests that never
 * asked for a seed would generate the *same* email / Account name. That surfaces as a `409` or
 * `DUPLICATES_DETECTED` failure which reproduces only in certain test orders — the worst kind of
 * flake to chase, because the test that causes it is not the test that fails.
 *
 * Verified before the fix: after one `makeUser({}, 12345)` call, two later *unseeded* `makeUser()`
 * calls returned the identical address (`america50@hotmail.com`).
 *
 * A seeded call now gets its OWN generator and leaves the shared one untouched.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 *
 * @param seed omit for random data (the shared instance); pass a number for a private,
 *             reproducible generator that cannot affect any other test.
 */
export function fakerFor(seed?: number): Faker {
  if (seed === undefined) return sharedFaker;
  const scoped = new Faker({ locale: en });
  scoped.seed(seed);
  return scoped;
}
