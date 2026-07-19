import { describe, expect, it } from "vitest";
import { runOntologyLint } from "./index.ts";
import { lintOntology } from "./lint.ts";

describe("lintOntology (unit, synthetic ontology)", () => {
  const baseOntology = {
    subtypes: { Engine: "IndependentContinuant", Symptom: "IndependentContinuant", Foo: "Symptom" },
    classes: { Bar: { equivalentTo: "Engine ⊓ ∃hasDtc.Foo" } },
    views: { generic: { classes: ["Bar"] } },
  };
  const baseDict = { codes: { P0001: { concept: "Foo" } } };

  it("passes clean, fully-covered registries", () => {
    const result = lintOntology({ ontology: baseOntology, dtcDictionary: baseDict });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("errors when a DTC maps to an undeclared concept", () => {
    const result = lintOntology({
      ontology: baseOntology,
      dtcDictionary: { codes: { P9999: { concept: "Nonexistent" } } },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "dtc_unresolved_concept",
        message: expect.stringContaining("P9999"),
      }),
    ]);
  });

  it("errors when a view references an undeclared class", () => {
    const result = lintOntology({
      ontology: { ...baseOntology, views: { generic: { classes: ["Bar", "Ghost"] } } },
      dtcDictionary: baseDict,
    });
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "view_references_unknown_class",
        message: expect.stringContaining("Ghost"),
      }),
    ]);
  });

  it("warns (does not error) on a Symptom subtype with no DTC coverage", () => {
    const result = lintOntology({
      ontology: { ...baseOntology, subtypes: { ...baseOntology.subtypes, Orphan: "Symptom" } },
      dtcDictionary: baseDict,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([expect.objectContaining({ code: "orphan_symptom_class" })]);
  });

  it("does not warn when the orphan symptom is explicitly allow-listed", () => {
    const result = lintOntology({
      ontology: { ...baseOntology, subtypes: { ...baseOntology.subtypes, Orphan: "Symptom" } },
      dtcDictionary: baseDict,
      allowNonDtcSymptoms: ["Orphan"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("warns on a declared class that no view includes", () => {
    const result = lintOntology({
      ontology: {
        ...baseOntology,
        classes: { ...baseOntology.classes, Unreachable: {} },
        views: { generic: { classes: ["Bar"] } },
      },
      dtcDictionary: baseDict,
    });
    expect(result.warnings).toEqual([expect.objectContaining({ code: "class_not_in_any_view" })]);
  });

  it("errors when a cartridge requires a class the ontology never declares", () => {
    const result = lintOntology({
      ontology: baseOntology,
      dtcDictionary: baseDict,
      cartridgeRequiredClasses: ["Bar", "SomeUnknownClass"],
    });
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "cartridge_requires_unknown_class",
        message: expect.stringContaining("SomeUnknownClass"),
      }),
    ]);
  });

  it("errors when a vehicle references an undeclared engine family", () => {
    const result = lintOntology({
      ontology: baseOntology,
      dtcDictionary: baseDict,
      vehicleProfiles: {
        vehicles: {
          "veh:x": {
            make: "X",
            model: "Y",
            year: 2015,
            trim: null,
            engineFamily: "missing-family",
          },
        },
        engineFamilies: {
          real: { label: "Real", view: "generic", cartridges: [] },
        },
      },
    });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "vehicle_unknown_engine_family" }),
    ]);
  });

  it("errors when an engine family references an undeclared view", () => {
    const result = lintOntology({
      ontology: baseOntology,
      dtcDictionary: baseDict,
      vehicleProfiles: {
        vehicles: {},
        engineFamilies: {
          fam: { label: "Fam", view: "no-such-view", cartridges: [] },
        },
      },
    });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "engine_family_unknown_view" }),
    ]);
  });

  it("errors when an engine family lists an unregistered cartridge name", () => {
    const result = lintOntology({
      ontology: baseOntology,
      dtcDictionary: baseDict,
      vehicleProfiles: {
        vehicles: {},
        engineFamilies: {
          fam: { label: "Fam", view: "generic", cartridges: ["ghost-cart"] },
        },
      },
      registeredCartridgeNames: ["misfire"],
    });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: "engine_family_unknown_cartridge" }),
    ]);
  });
});

describe("runOntologyLint (integration, the real registries)", () => {
  // Cartridge-inclusive parity (requires.classes + cartridge names) is checked
  // one level up in @auto/cartridges — this package cannot depend on
  // @auto/cartridges (wrong direction: cartridges already depends on ontology).
  it("is clean with no cartridge classes supplied (schema + profile→view wiring)", () => {
    const result = runOntologyLint();
    expect(result.errors, JSON.stringify(result.errors, null, 2)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
