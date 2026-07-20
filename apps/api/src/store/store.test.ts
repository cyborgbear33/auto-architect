import { describe, it } from "vitest";
import { createDrizzleStore, createMemoryStore } from "./index.ts";
import { runStoreConformance } from "./store.conformance.ts";

// The in-memory adapter is always conformance-tested.
runStoreConformance("memory", () => createMemoryStore());

// The Drizzle/Postgres adapter is conformance-tested whenever DATABASE_URL is
// provided (e.g. `pnpm infra:up` then `DATABASE_URL=... pnpm --filter @auto/api test`).
// Without a database it is skipped, not silently dropped.
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  runStoreConformance("postgres", () => createDrizzleStore(databaseUrl));
} else {
  describe.skip("Store conformance: postgres (set DATABASE_URL to run)", () => {
    it("skipped — no DATABASE_URL", () => {});
  });
}
