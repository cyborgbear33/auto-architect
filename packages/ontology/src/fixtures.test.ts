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

const FIXTURES = [
  "misfire_realize_fixture.json",
  "lean_realize_fixture.json",
  "camcrank_realize_fixture.json",
  "thermostat_realize_fixture.json",
  "ect_circuit_realize_fixture.json",
  "ignition_coil_realize_fixture.json",
  "injector_circuit_realize_fixture.json",
  "map_sensor_realize_fixture.json",
  "knock_sensor_realize_fixture.json",
  "throttle_position_realize_fixture.json",
  "misfire_reason_fixture.json",
  "oilstarvation_reason_fixture.json",
  "camcrank_reason_fixture.json",
] as const;

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
