import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * The misfire cartridge: SAE-generic (P0300-P0304 + high engine load). Any
 * OBD-II vehicle can use this unchanged — it carries no manufacturer-specific
 * thresholds. Modeled directly on garden-architect's water.ts cartridge.
 */
const ENGINE_LOAD_PID = "ENGINE_LOAD";
const HIGH_LOAD_PCT = 70;

function misfirePlaybook(): CandidateAction[] {
  return [
    {
      id: "stop-driving-misfire",
      description:
        "stop driving and diagnose now — a sustained misfire dumps unburned fuel into the catalytic converter and can destroy it",
      impact: 0.9,
      confidence: 0.9,
      infoGain: 0.1,
      cost: 0.4,
      risk: 0.05,
      reversibility: 1,
      tags: ["stabilize", "safety"],
    },
    {
      id: "swap-coil-plug",
      description:
        "swap the ignition coil and spark plug from the misfiring cylinder with an adjacent cylinder, then rescan — if the misfire follows the part, it's ignition; if it stays with the cylinder, look downstream",
      impact: 0.3,
      confidence: 0.8,
      infoGain: 0.9,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "compression-leakdown-test",
      description:
        "run a cylinder compression/leak-down test to rule out a mechanical cause (valve, ring, head gasket) before replacing electrical parts",
      impact: 0.5,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.3,
      risk: 0.1,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "check-injector",
      description: "test or swap the fuel injector for the misfiring cylinder",
      impact: 0.3,
      confidence: 0.6,
      infoGain: 0.6,
      cost: 0.2,
      risk: 0.1,
      reversibility: 0.9,
    },
  ];
}

function misfireDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: misfire under load`,
    statement: {
      currentState: "a cylinder misfire DTC is active while the engine is under high load",
      desiredState: "no misfire DTCs, stable idle and load performance",
      gap: "the root cause of the misfire (ignition, fuel, or mechanical) is not yet isolated",
      whyItMatters:
        "a sustained misfire under load can overheat and destroy the catalytic converter — this is time-sensitive",
      urgency: "high",
    },
    gapType: "causal",
    desiredState: {
      successCriteria:
        "the misfire DTC does not return after a completed drive cycle under comparable load",
      measurement:
        "rescan for stored/pending misfire DTCs after the recommended test/repair and a drive cycle",
    },
    actions: misfirePlaybook(),
  };
}

export const misfireCartridge: Cartridge = {
  name: "misfire",
  perception: [
    {
      dtcConcept: "CylinderMisfire",
      concept: "CylinderMisfire",
      as: "symptom",
      slot: "cylinder-misfire",
    },
    {
      pid: ENGINE_LOAD_PID,
      when: { gt: HIGH_LOAD_PCT },
      concept: "HighLoad",
      as: "condition",
      slot: "high-load",
    },
    {
      mode06Concept: "FailedMisfireMonitor",
      concept: "FailedMisfireMonitor",
      as: "condition",
      slot: "mode06-misfire",
    },
  ],
  framing: [{ whenClass: "MisfireUnderLoad", priority: 100, build: misfireDraft }],
  requires: {
    classes: [
      "CylinderMisfire",
      "HighLoad",
      "RecurringHighLoad",
      "FailedMisfireMonitor",
      "MisfireUnderLoad",
    ],
    dtcConcepts: ["CylinderMisfire"],
    pids: [ENGINE_LOAD_PID],
    mode06Concepts: ["FailedMisfireMonitor"],
  },
};
