import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic ignition coil circuit cartridge: P0351–P0358 (DTC-only).
 * Distinct from misfire — a coil circuit code may precede or accompany misfire.
 */

function playbook(): CandidateAction[] {
  return [
    {
      id: "swap-coil-suspect",
      description:
        "swap the suspect ignition coil with an adjacent cylinder, then rescan — if the circuit/misfire code follows the coil, replace it",
      impact: 0.55,
      confidence: 0.8,
      infoGain: 0.9,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "confirm which cylinder the P035x digit points at before swapping parts",
    },
    {
      id: "check-coil-connector",
      description:
        "inspect the coil connector and primary wiring for open/short/chafing before condemning the coil",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "check-spark-plug-gap",
      description:
        "inspect the spark plug for fouling / wrong gap that can stress the coil secondary",
      impact: 0.4,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: ignition coil circuit`,
    statement: {
      currentState: "an ignition coil primary/secondary circuit DTC is active",
      desiredState: "no coil circuit DTC and stable spark under load",
      gap: "whether the fault is the coil, connector/wiring, or a stressed secondary (plug) is not yet isolated",
      whyItMatters:
        "coil circuit faults commonly cascade into misfire under load and can cook the catalyst if driven hard",
      urgency: "high",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no P035x after a drive cycle that previously set the code",
      measurement: "rescan; confirm no pending coil or misfire codes under comparable load",
    },
    actions: playbook(),
  };
}

export const ignitionCoilCartridge: Cartridge = {
  name: "ignition-coil",
  perception: [
    {
      dtcConcept: "IgnitionCoilCircuit",
      concept: "IgnitionCoilCircuit",
      as: "symptom",
      slot: "ignition-coil",
    },
  ],
  framing: [{ whenClass: "IgnitionCoilCircuitFault", priority: 70, build: draft }],
  requires: {
    classes: ["IgnitionCoilCircuit", "IgnitionCoilCircuitFault"],
    dtcConcepts: ["IgnitionCoilCircuit"],
  },
};
