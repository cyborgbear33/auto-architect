import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic throttle / pedal position sensor cartridge: P0120–P0124 /
 * P0220–P0223 (DTC-only). THROTTLE_POS is evidence adjacency only.
 */

function playbook(): CandidateAction[] {
  return [
    {
      id: "check-tps-connector",
      description:
        "inspect the throttle / APP sensor connector and 5V reference for open/short/chafing",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "sweep-throttle-pos",
      description:
        "sweep the pedal / throttle while watching THROTTLE_POS for dropouts, flats, or dual-track disagreement",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.05,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "inspect-throttle-body",
      description:
        "inspect the throttle body for carbon that binds the plate before replacing the sensor/module",
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: throttle position sensor`,
    statement: {
      currentState: "a throttle / pedal position sensor circuit DTC is active",
      desiredState: "no TPS/APP circuit DTC and smooth throttle response",
      gap: "whether the fault is wiring, carbon bind, or the sensor/module is not yet isolated",
      whyItMatters: "TPS/APP faults can force limp mode, surge, or unsafe throttle response",
      urgency: "high",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no TPS/APP circuit DTC after a drive cycle that previously set the code",
      measurement: "rescan; confirm THROTTLE_POS sweeps smoothly without dropouts",
    },
    actions: playbook(),
  };
}

export const throttlePositionCartridge: Cartridge = {
  name: "throttle-position",
  perception: [
    {
      dtcConcept: "ThrottlePositionCode",
      concept: "ThrottlePositionCode",
      as: "symptom",
      slot: "throttle-position",
    },
  ],
  framing: [{ whenClass: "ThrottlePositionSensorFault", priority: 72, build: draft }],
  requires: {
    classes: ["ThrottlePositionCode", "ThrottlePositionSensorFault"],
    dtcConcepts: ["ThrottlePositionCode"],
    pids: ["THROTTLE_POS"],
  },
};
