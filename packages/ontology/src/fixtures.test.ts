import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The logos-bridge real-LOGOS smoke tests and ONTOLOGY_DEV_GUIDE both point at
 * these fixture paths. Keep them present and parseable so a rename/move cannot
 * silently break CI smoke without a failing ontology-package test.
 */
const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)), "../fixtures");

const FIXTURES = ["misfire_realize_fixture.json", "misfire_reason_fixture.json"] as const;

describe("ontology fixtures (path + parse)", () => {
  for (const name of FIXTURES) {
    it(`${name} exists and parses as JSON`, () => {
      const path = resolve(fixturesDir, name);
      expect(existsSync(path), `missing fixture: ${path}`).toBe(true);
      const raw = readFileSync(path, "utf8");
      expect(() => JSON.parse(raw)).not.toThrow();
    });
  }
});
