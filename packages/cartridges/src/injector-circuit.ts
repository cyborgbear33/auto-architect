import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** SAE-generic injector circuit cartridge: P0201–P0208 (DTC-only). */

function playbook(): CandidateAction[] {
  return [
    {
      id: "check-injector-connector",
      description:
        "inspect the injector connector and harness for open/short/chafing on the coded cylinder",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "confirm which cylinder the P020x digit points at before probing",
    },
    {
      id: "measure-injector-resistance",
      description: "measure injector coil resistance and compare to a known-good cylinder / spec",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "swap-injector-suspect",
      description:
        "swap the suspect injector with an adjacent cylinder when access allows, then rescan",
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.75,
      cost: 0.25,
      risk: 0.1,
      reversibility: 0.8,
      tags: ["diagnostic"],
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: injector circuit`,
    statement: {
      currentState: "a fuel injector circuit / open DTC is active",
      desiredState: "no injector circuit DTC and even cylinder contribution",
      gap: "whether the fault is wiring vs the injector coil itself is not yet isolated",
      whyItMatters:
        "an open injector circuit commonly produces a hard misfire and dumps raw fuel risk into the catalyst path",
      urgency: "high",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no P020x after a drive cycle that previously set the code",
      measurement: "rescan; confirm no pending injector or misfire codes",
    },
    actions: playbook(),
  };
}

export const injectorCircuitCartridge: Cartridge = {
  name: "injector-circuit",
  perception: [
    {
      dtcConcept: "InjectorCircuitCode",
      concept: "InjectorCircuitCode",
      as: "symptom",
      slot: "injector-circuit",
    },
  ],
  framing: [{ whenClass: "InjectorCircuitFault", priority: 68, build: draft }],
  requires: {
    classes: ["InjectorCircuitCode", "InjectorCircuitFault"],
    dtcConcepts: ["InjectorCircuitCode"],
  },
};
