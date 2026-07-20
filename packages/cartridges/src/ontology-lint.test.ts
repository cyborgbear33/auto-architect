import {
  dtcConceptsCovered,
  lookupPid,
  mode06ConceptsCovered,
  runOntologyLint,
} from "@auto/ontology";
import { describe, expect, it } from "vitest";
import { perceivedDtcConcepts, perceivedMode06Concepts } from "./perception.ts";
import { allCartridges } from "./registry.ts";

/**
 * Always-on, Python-free companion to `scripts/lint-ontology.mjs`'s hard
 * LOGOS well-formedness gate: every class any registered cartridge
 * `requires` must actually be declared in dl-ontology.json. Lives here (not
 * in @auto/ontology) because ontology cannot depend on cartridges.
 */
describe("ontology ↔ cartridge parity", () => {
  it("every registered cartridge only requires classes the ontology actually declares, and every engine-family cartridge name resolves", () => {
    const cartridgeRequiredClasses = [...new Set(allCartridges.flatMap((c) => c.requires.classes))];
    const registeredCartridgeNames = allCartridges.map((c) => c.name);
    expect(cartridgeRequiredClasses.length).toBeGreaterThan(0);
    const result = runOntologyLint({
      cartridgeRequiredClasses,
      registeredCartridgeNames,
    });
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("every DTC concept cartridges perceive has ≥1 dtc-dictionary row", () => {
    const covered = new Set(dtcConceptsCovered());
    const perceived = perceivedDtcConcepts(allCartridges);
    expect(perceived.length).toBeGreaterThan(0);
    for (const concept of perceived) {
      expect(covered.has(concept), `missing DTC rows for concept ${concept}`).toBe(true);
    }
  });

  it("every cartridge-required PID is in the thin SAE pid-dictionary with a unit", () => {
    const pids = [...new Set(allCartridges.flatMap((c) => c.requires.pids ?? []))];
    expect(pids.length).toBeGreaterThan(0);
    for (const key of pids) {
      const entry = lookupPid(key);
      expect(entry, `pid-dictionary missing ${key}`).toBeDefined();
      expect(entry?.unit.length).toBeGreaterThan(0);
    }
  });

  it("every Mode 06 concept cartridges perceive has ≥1 mode06-dictionary row", () => {
    const covered = new Set(mode06ConceptsCovered());
    const perceived = perceivedMode06Concepts(allCartridges);
    expect(perceived.length).toBeGreaterThan(0);
    for (const concept of perceived) {
      expect(covered.has(concept), `missing Mode 06 rows for concept ${concept}`).toBe(true);
    }
  });
});
