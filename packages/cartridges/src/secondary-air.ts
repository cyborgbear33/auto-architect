import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic secondary air injection cartridge: P0410–P0412 + Mode 06 OBDMID $71.
 */

function airPlaybook(): CandidateAction[] {
  return [
    {
      id: "listen-air-pump",
      description:
        "on a cold start, confirm the secondary-air pump runs and check for seized pump / disconnected hose",
      impact: 0.55,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "verify the AIR pump fuse/relay before condemning the pump",
    },
    {
      id: "smoke-test-air-system",
      description: "smoke-test or pressure-check AIR hoses and check valves for leaks / stuck valves",
      impact: 0.6,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.25,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
    {
      id: "check-air-switching-valve",
      description: "inspect the AIR switching/combination valve for a stuck-open or stuck-closed condition",
      impact: 0.5,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
    },
  ];
}

function airDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: secondary air injection`,
    statement: {
      currentState:
        "a secondary air injection system DTC is active, or Mode 06 secondary-air monitor failed",
      desiredState: "no secondary-air DTC across a completed AIR monitor (typically cold-start)",
      gap: "whether the pump, valves, hoses, or control circuit is at fault is not yet isolated",
      whyItMatters: "failed AIR systems raise cold-start emissions and can set follow-on catalyst codes",
      urgency: "low",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no secondary-air DTC after a cold start with a completed AIR monitor",
      measurement: "rescan after cold start; confirm AIR status / pump activity when commanded",
    },
    actions: airPlaybook(),
  };
}

export const secondaryAirCartridge: Cartridge = {
  name: "secondary-air",
  perception: [
    {
      dtcConcept: "SecondaryAirCode",
      concept: "SecondaryAirCode",
      as: "symptom",
      slot: "secondary-air",
    },
    {
      mode06Concept: "FailedSecondaryAirMonitor",
      concept: "FailedSecondaryAirMonitor",
      as: "condition",
      slot: "mode06-secondary-air",
    },
  ],
  framing: [{ whenClass: "SecondaryAirSystemFault", priority: 45, build: airDraft }],
  requires: {
    classes: ["SecondaryAirCode", "FailedSecondaryAirMonitor", "SecondaryAirSystemFault"],
    dtcConcepts: ["SecondaryAirCode"],
    mode06Concepts: ["FailedSecondaryAirMonitor"],
  },
};
