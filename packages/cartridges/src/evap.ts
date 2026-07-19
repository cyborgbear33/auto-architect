import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** SAE-generic EVAP leak cartridge: P0442 (small leak) / P0455 (large leak). */

function smallLeakPlaybook(): CandidateAction[] {
  return [
    {
      id: "check-gas-cap",
      description:
        "check the gas cap seal and that it clicks fully closed — the single most common small-leak cause",
      impact: 0.3,
      confidence: 0.6,
      infoGain: 0.3,
      cost: 0.02,
      risk: 0.02,
      reversibility: 1,
      tags: ["measure"],
      firstStep: "check the gas cap first — it's free and fixes a large share of small EVAP leaks",
    },
    {
      id: "smoke-test-evap-small",
      description:
        "smoke-test the EVAP system to visually find the small leak (fill neck, hoses, canister seams)",
      impact: 0.6,
      confidence: 0.8,
      infoGain: 0.9,
      cost: 0.3,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function largeLeakPlaybook(): CandidateAction[] {
  return [
    {
      id: "smoke-test-evap-large",
      description:
        "smoke-test the EVAP system — a large leak is usually visible immediately (disconnected hose, cracked canister, stuck-open purge/vent valve)",
      impact: 0.7,
      confidence: 0.85,
      infoGain: 0.9,
      cost: 0.3,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "inspect-purge-vent-valves",
      description: "inspect the purge and vent solenoid valves for a stuck-open condition",
      impact: 0.5,
      confidence: 0.6,
      infoGain: 0.6,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
    },
  ];
}

function evapDraft(size: "small" | "large"): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => ({
    label: `${vehicle.label}: EVAP ${size} leak`,
    statement: {
      currentState: `an evaporative emission system ${size} leak DTC is active`,
      desiredState: "no EVAP leak DTC across a full drive cycle",
      gap: "the physical leak location has not yet been found",
      whyItMatters:
        "fails emissions testing and (for large leaks) risks fuel vapor escaping to atmosphere",
      urgency: "low",
    },
    gapType: "causal",
    desiredState: {
      successCriteria:
        "no EVAP leak DTC across a full drive cycle including a completed EVAP monitor",
      measurement:
        "rescan after the repair and confirm the EVAP monitor completes without a new leak DTC",
    },
    actions: size === "small" ? smallLeakPlaybook() : largeLeakPlaybook(),
  });
}

export const evapCartridge: Cartridge = {
  name: "evap",
  perception: [
    { dtcConcept: "EvapCodeSmall", concept: "EvapCodeSmall", as: "symptom", slot: "evap-small" },
    { dtcConcept: "EvapCodeLarge", concept: "EvapCodeLarge", as: "symptom", slot: "evap-large" },
  ],
  framing: [
    { whenClass: "EvapLeakSmall", priority: 40, build: evapDraft("small") },
    { whenClass: "EvapLeakLarge", priority: 50, build: evapDraft("large") },
  ],
  requires: {
    classes: ["EvapCodeSmall", "EvapCodeLarge", "EvapLeakSmall", "EvapLeakLarge"],
    dtcConcepts: ["EvapCodeSmall", "EvapCodeLarge"],
  },
};
