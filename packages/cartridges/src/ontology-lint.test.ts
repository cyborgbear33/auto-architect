import { runOntologyLint } from "@auto/ontology";
import { describe, expect, it } from "vitest";
import { allCartridges } from "./registry.ts";

/**
 * Always-on, Python-free companion to `scripts/lint-ontology.mjs`'s hard
 * LOGOS well-formedness gate: every class any registered cartridge
 * `requires` must actually be declared in dl-ontology.json. Lives here (not
 * in @auto/ontology) because ontology cannot depend on cartridges.
 */
describe("ontology ↔ cartridge parity", () => {
  it("every registered cartridge only requires classes the ontology actually declares", () => {
    const cartridgeRequiredClasses = [...new Set(allCartridges.flatMap((c) => c.requires.classes))];
    expect(cartridgeRequiredClasses.length).toBeGreaterThan(0);
    const result = runOntologyLint({ cartridgeRequiredClasses });
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
