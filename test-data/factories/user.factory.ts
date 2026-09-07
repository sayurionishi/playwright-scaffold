import { fakerFor } from '../faker';

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

/**
 * EXAMPLE Faker factory for dynamic happy-path data.
 *
 * RULES (data-strategy skill):
 *  - Factories produce DYNAMIC happy-path data (Faker). Use for payloads/content.
 *  - `overrides` lets a test pin specific fields; everything else is randomized.
 *  - `seed` makes a call reproducible using its OWN generator — see test-data/faker.ts.
 *  - Curated INVALID/boundary inputs do NOT belong here — see test-data/static/.
 */
export function makeUser(overrides: Partial<NewUser> = {}, seed?: number): NewUser {
  const faker = fakerFor(seed);
  return {
    email: faker.internet.email().toLowerCase(),
    firstName: faker.person.firstName(),
    lastName: faker.person.lastName(),
    password: faker.internet.password({ length: 16 }),
    ...overrides,
  };
}
