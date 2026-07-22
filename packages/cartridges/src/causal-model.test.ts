import { describe, expect, it } from "vitest";
import { composeCausalModel, symptomsFromEvidence } from "./causal-model.ts";
import type { ClassEvidenceBundle } from "./class-evidence.ts";
import { misfireCartridge } from "./misfire.ts";
import type { FramingResult, VehicleView } from "./types.ts";

const vehicle: VehicleView = {
  vehicleId: "veh:x",
  label: "Test Jeep",
  engineFamily: "fca-tigershark-2.4",
  dtcs: [{ code: "P0304", status: "stored", description: "Cylinder 4 Misfire Detected" }],
  pids: { ENGINE_LOAD: 85 },
};

describe("composeCausalModel", () => {
  it("keeps authored misfire causes and merges live evidence symptoms", () => {
    const draft = misfireCartridge.framing[0]!.build(vehicle);
    const evidence: ClassEvidenceBundle = {
      className: "MisfireUnderLoad",
      dtcs: vehicle.dtcs,
      pids: [{ pid: "ENGINE_LOAD", value: 85, unit: "percent", thresholdMet: true }],
      freezeFrames: [],
      mode06: [],
    };
    const model = composeCausalModel({ draft, evidence });
    expect(model.mostLikelyCauses?.[0]).toMatch(/ignition/i);
    expect(model.possibleCauses?.some((c) => /injector/i.test(c))).toBe(true);
    expect(model.symptoms?.some((s) => s.includes("P0304"))).toBe(true);
    expect(model.symptoms?.some((s) => s.includes("ENGINE_LOAD"))).toBe(true);
    expect(model.rootCauses).toBeUndefined();
  });

  it("falls back to playbook actions when framing omits causalModel", () => {
    const draft: FramingResult = {
      label: "x",
      statement: {
        currentState: "something is wrong",
        desiredState: "fixed",
        gap: "unknown",
      },
      gapType: "causal",
      desiredState: { successCriteria: "ok" },
      actions: [
        {
          id: "stabilize",
          description: "stop and assess",
          confidence: 0.9,
          tags: ["stabilize"],
        },
        { id: "check-a", description: "inspect cause A", confidence: 0.8 },
        { id: "check-b", description: "inspect cause B", confidence: 0.5 },
      ],
    };
    const model = composeCausalModel({ draft, evidence: null });
    expect(model.symptoms).toEqual(["something is wrong"]);
    expect(model.possibleCauses).toEqual(["inspect cause A", "inspect cause B"]);
    expect(model.mostLikelyCauses?.[0]).toBe("inspect cause A");
  });
});

describe("symptomsFromEvidence", () => {
  it("labels failed Mode 06 rows", () => {
    const symptoms = symptomsFromEvidence(
      {
        className: "X",
        dtcs: [],
        pids: [],
        freezeFrames: [],
        mode06: [{ mid: "A1", tid: "01", value: 1, min: 0, max: 0.5, passed: false }],
      },
      "baseline",
    );
    expect(symptoms[0]).toMatch(/Mode 06/);
    expect(symptoms).toContain("baseline");
  });
});
