import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic EGR cartridge: P0400–P0402 flow + Mode 06 OBDMID $31;
 * P0403–P0406 control/sensor circuit (DTC-only).
 */

function flowPlaybook(): CandidateAction[] {
  return [
    {
      id: "inspect-egr-passages",
      description:
        "inspect EGR valve and passages for carbon restriction or a stuck-open pintle before replacing parts",
      impact: 0.6,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.25,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep:
        "command the EGR valve (if available) and watch for RPM/MAP change — no change suggests stuck/plugged",
    },
    {
      id: "compare-commanded-egr",
      description:
        "compare commanded EGR vs actual response (MAP/RPM) under the conditions that set the code",
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.75,
      cost: 0.1,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function circuitPlaybook(): CandidateAction[] {
  return [
    {
      id: "check-egr-wiring",
      description: "inspect EGR control/sensor wiring and connector for open/short/chafing",
      impact: 0.55,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "measure-egr-sensor-circuit",
      description: "measure EGR position/feedback sensor voltage and compare to commanded duty",
      impact: 0.5,
      confidence: 0.65,
      infoGain: 0.75,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function flowDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: EGR flow`,
    statement: {
      currentState: "an EGR flow malfunction DTC is active, or Mode 06 EGR monitor failed",
      desiredState: "no EGR flow DTC across a completed EGR monitor",
      gap: "whether the valve, passages, or control strategy is at fault is not yet isolated",
      whyItMatters: "EGR flow faults raise NOx, can cause knock/ping, and fail emissions testing",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no EGR flow DTC after repair with a completed EGR monitor",
      measurement: "rescan; confirm commanded EGR produces expected MAP/RPM response",
    },
    actions: flowPlaybook(),
  };
}

function circuitDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: EGR control/sensor circuit`,
    statement: {
      currentState: "an EGR control or position-sensor circuit DTC is active",
      desiredState: "no EGR circuit DTC after wiring/sensor/valve repair",
      gap: "whether the fault is wiring vs the valve/sensor assembly is not yet isolated",
      whyItMatters:
        "circuit faults disable proper EGR control and can cascade into flow or misfire codes",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no EGR circuit DTC after a drive cycle that previously set the code",
      measurement: "rescan; confirm sensor voltage tracks commanded EGR",
    },
    actions: circuitPlaybook(),
  };
}

export const egrCartridge: Cartridge = {
  name: "egr",
  perception: [
    { dtcConcept: "EgrFlowCode", concept: "EgrFlowCode", as: "symptom", slot: "egr-flow" },
    { dtcConcept: "EgrCircuitCode", concept: "EgrCircuitCode", as: "symptom", slot: "egr-circuit" },
    {
      mode06Concept: "FailedEgrMonitor",
      concept: "FailedEgrMonitor",
      as: "condition",
      slot: "mode06-egr",
    },
  ],
  framing: [
    { whenClass: "EgrFlowFault", priority: 55, build: flowDraft },
    { whenClass: "EgrCircuitFault", priority: 50, build: circuitDraft },
  ],
  requires: {
    classes: [
      "EgrFlowCode",
      "EgrCircuitCode",
      "FailedEgrMonitor",
      "EgrFlowFault",
      "EgrCircuitFault",
    ],
    dtcConcepts: ["EgrFlowCode", "EgrCircuitCode"],
    mode06Concepts: ["FailedEgrMonitor"],
    pids: ["COMMANDED_EGR", "EGR_ERROR"],
  },
};
