import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** SAE-generic cam/crank correlation cartridge: P0016-P0018 family (timing-chain-adjacent). */

function playbook(): CandidateAction[] {
  return [
    {
      id: "stop-driving-timing",
      description:
        "stop driving and diagnose — a real cam/crank correlation fault can mean a stretched or skipped timing chain, and continuing to run risks catastrophic valve/piston contact",
      impact: 0.85,
      confidence: 0.7,
      infoGain: 0.1,
      cost: 0.4,
      risk: 0.1,
      reversibility: 1,
      tags: ["stabilize", "safety"],
    },
    {
      id: "check-cam-crank-sensor-wiring",
      description:
        "inspect camshaft/crankshaft position sensor connectors and wiring for damage or corrosion before assuming a mechanical timing fault",
      impact: 0.3,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "rule out a $20 sensor/wiring fault before opening the timing cover",
    },
    {
      id: "verify-timing-marks",
      description:
        "pull the timing cover access point and verify cam-to-crank timing marks/alignment directly",
      impact: 0.7,
      confidence: 0.7,
      infoGain: 0.9,
      cost: 0.3,
      risk: 0.15,
      reversibility: 0.8,
      tags: ["diagnostic"],
    },
    {
      id: "inspect-timing-chain-tensioner",
      description:
        "inspect the timing chain tensioner and guides for wear if timing marks confirm chain stretch",
      impact: 0.6,
      confidence: 0.6,
      infoGain: 0.7,
      cost: 0.4,
      risk: 0.2,
      reversibility: 0.7,
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: cam/crank correlation fault`,
    statement: {
      currentState: "a camshaft-crankshaft correlation DTC is active",
      desiredState: "cam/crank correlation within spec and DTC cleared",
      gap: "not yet known whether this is a sensor/wiring fault or a real timing-chain mechanical fault",
      whyItMatters:
        "a real timing fault risks catastrophic engine damage if driven; a sensor fault is comparatively cheap",
      urgency: "high",
    },
    gapType: "causal",
    desiredState: {
      successCriteria:
        "cam/crank correlation DTC does not return and timing is confirmed within spec",
      measurement: "verify timing marks directly and rescan after the repair and a drive cycle",
    },
    actions: playbook(),
  };
}

export const camCrankCorrelationCartridge: Cartridge = {
  name: "cam-crank-correlation",
  perception: [
    {
      dtcConcept: "CamCrankCorrelation",
      concept: "CamCrankCorrelation",
      as: "symptom",
      slot: "cam-crank-correlation",
    },
  ],
  framing: [{ whenClass: "CamCrankCorrelationFault", priority: 95, build: draft }],
  requires: {
    classes: ["CamCrankCorrelation", "CamCrankCorrelationFault"],
    dtcConcepts: ["CamCrankCorrelation"],
  },
};
