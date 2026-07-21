import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic MAP/baro sensor cartridge: P0105–P0109 (DTC-only).
 * INTAKE_PRESSURE is evidence adjacency — no invented kPa thresholds.
 */

function playbook(): CandidateAction[] {
  return [
    {
      id: "inspect-map-hose",
      description:
        "inspect the MAP sensor vacuum hose / port for cracks, soft hose, or a clogged port",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.1,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "confirm the hose is seated and not collapsed before replacing the sensor",
    },
    {
      id: "check-map-connector",
      description: "inspect the MAP connector and 5V reference / ground for open/short",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "compare-map-baro",
      description:
        "with key-on engine-off, compare MAP / baro to local altitude expectation (plausibility only)",
      impact: 0.4,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.05,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: MAP sensor circuit`,
    statement: {
      currentState: "a manifold absolute pressure / barometric pressure circuit DTC is active",
      desiredState: "no MAP circuit DTC and plausible load fueling",
      gap: "whether the fault is hose/port, wiring, or the sensor itself is not yet isolated",
      whyItMatters:
        "MAP faults corrupt load calculation on speed-density engines and commonly drive lean/rich follow-on codes",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no P010x after a drive cycle that previously set the code",
      measurement: "rescan; confirm INTAKE_PRESSURE tracks throttle without dropouts",
    },
    actions: playbook(),
  };
}

export const mapSensorCartridge: Cartridge = {
  name: "map-sensor",
  perception: [
    { dtcConcept: "MapSensorCode", concept: "MapSensorCode", as: "symptom", slot: "map-sensor" },
  ],
  framing: [{ whenClass: "MapSensorFault", priority: 62, build: draft }],
  requires: {
    classes: ["MapSensorCode", "MapSensorFault"],
    dtcConcepts: ["MapSensorCode"],
    pids: ["INTAKE_PRESSURE"],
  },
};
