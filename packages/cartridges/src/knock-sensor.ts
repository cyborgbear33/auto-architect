import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** SAE-generic knock sensor circuit cartridge: P0325–P0328 / P0330–P0333 (DTC-only). */

function playbook(): CandidateAction[] {
  return [
    {
      id: "check-knock-connector",
      description: "inspect the knock sensor connector and shielded harness for open/short/chafing",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "check-knock-torque",
      description:
        "verify knock sensor mounting torque / seating — a loose sensor commonly sets circuit/range codes",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.75,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "rule-out-mechanical-knock",
      description:
        "rule out real detonation causes (wrong octane, overheating, carbon) before replacing a sensor that tests good",
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: knock sensor circuit`,
    statement: {
      currentState: "a knock sensor circuit / range DTC is active",
      desiredState: "no knock sensor DTC and normal spark retard authority",
      gap: "whether the fault is wiring/mounting vs the sensor vs real detonation is not yet isolated",
      whyItMatters:
        "lost knock sensing can force conservative timing or hide real detonation that damages pistons",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no knock sensor DTC after a drive cycle that previously set the code",
      measurement: "rescan; confirm no pending knock codes under load",
    },
    actions: playbook(),
  };
}

export const knockSensorCartridge: Cartridge = {
  name: "knock-sensor",
  perception: [
    {
      dtcConcept: "KnockSensorCode",
      concept: "KnockSensorCode",
      as: "symptom",
      slot: "knock-sensor",
    },
  ],
  framing: [{ whenClass: "KnockSensorCircuitFault", priority: 52, build: draft }],
  requires: {
    classes: ["KnockSensorCode", "KnockSensorCircuitFault"],
    dtcConcepts: ["KnockSensorCode"],
  },
};
