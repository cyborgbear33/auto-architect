import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic EVAP cartridge: leak (P0442/P0455…), purge (P0441/P0443/P0496 +
 * Mode 06 $3D), and vent circuit (P0446/P0449).
 */

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

function purgePlaybook(): CandidateAction[] {
  return [
    {
      id: "command-purge-valve",
      description:
        "command the purge solenoid with a scan tool and confirm click / vacuum change — rule out a stuck or open circuit before replacing the canister",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "verify purge fuse/relay and connector voltage before condemning the valve",
    },
    {
      id: "inspect-purge-line",
      description:
        "inspect the purge line from canister to intake for cracks, collapse, or incorrect routing that causes incorrect / high purge flow",
      impact: 0.5,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function ventPlaybook(): CandidateAction[] {
  return [
    {
      id: "command-vent-valve",
      description:
        "command the canister vent solenoid and confirm it opens/closes — a stuck-closed vent sets circuit/vent codes and blocks EVAP monitors",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "check for a water-logged or mud-packed vent filter before replacing the valve",
    },
    {
      id: "inspect-vent-filter",
      description:
        "inspect / replace the EVAP canister vent filter and check for rodent damage at the vent hose",
      impact: 0.45,
      confidence: 0.7,
      infoGain: 0.6,
      cost: 0.15,
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

function purgeDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: EVAP purge system`,
    statement: {
      currentState:
        "an EVAP purge-flow / purge-circuit DTC is active, or Mode 06 purge-flow monitor failed",
      desiredState: "correct purge flow with no purge DTC across a completed EVAP monitor",
      gap: "whether the purge valve, wiring, or vapor line is at fault is not yet isolated",
      whyItMatters:
        "incorrect purge flow skews fuel trim, can set follow-on lean/rich codes, and fails EVAP monitors",
      urgency: "low",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no purge DTC after commanding the valve and completing an EVAP monitor",
      measurement: "rescan after repair; confirm purge duty / flow when commanded",
    },
    actions: purgePlaybook(),
  };
}

function ventDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: EVAP vent system`,
    statement: {
      currentState: "an EVAP vent control / vent valve circuit DTC is active",
      desiredState: "vent valve opens and closes on command with no vent DTC",
      gap: "whether the vent solenoid, filter, or wiring is at fault is not yet isolated",
      whyItMatters: "a stuck vent blocks leak checks and commonly causes repeat EVAP codes",
      urgency: "low",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no vent DTC after commanding the valve and completing an EVAP monitor",
      measurement: "rescan after repair; confirm vent actuation and filter is clear",
    },
    actions: ventPlaybook(),
  };
}

export const evapCartridge: Cartridge = {
  name: "evap",
  perception: [
    { dtcConcept: "EvapCodeSmall", concept: "EvapCodeSmall", as: "symptom", slot: "evap-small" },
    { dtcConcept: "EvapCodeLarge", concept: "EvapCodeLarge", as: "symptom", slot: "evap-large" },
    { dtcConcept: "EvapPurgeCode", concept: "EvapPurgeCode", as: "symptom", slot: "evap-purge" },
    { dtcConcept: "EvapVentCode", concept: "EvapVentCode", as: "symptom", slot: "evap-vent" },
    {
      mode06Concept: "FailedEvapMonitorSmall",
      concept: "FailedEvapMonitorSmall",
      as: "condition",
      slot: "mode06-evap-small",
    },
    {
      mode06Concept: "FailedEvapMonitorLarge",
      concept: "FailedEvapMonitorLarge",
      as: "condition",
      slot: "mode06-evap-large",
    },
    {
      mode06Concept: "FailedEvapPurgeMonitor",
      concept: "FailedEvapPurgeMonitor",
      as: "condition",
      slot: "mode06-evap-purge",
    },
  ],
  framing: [
    { whenClass: "EvapLeakSmall", priority: 40, build: evapDraft("small") },
    { whenClass: "EvapLeakLarge", priority: 50, build: evapDraft("large") },
    { whenClass: "EvapPurgeSystemFault", priority: 48, build: purgeDraft },
    { whenClass: "EvapVentSystemFault", priority: 47, build: ventDraft },
  ],
  requires: {
    classes: [
      "EvapCodeSmall",
      "EvapCodeLarge",
      "EvapPurgeCode",
      "EvapVentCode",
      "FailedEvapMonitorSmall",
      "FailedEvapMonitorLarge",
      "FailedEvapPurgeMonitor",
      "EvapLeakSmall",
      "EvapLeakLarge",
      "EvapPurgeSystemFault",
      "EvapVentSystemFault",
    ],
    dtcConcepts: ["EvapCodeSmall", "EvapCodeLarge", "EvapPurgeCode", "EvapVentCode"],
    mode06Concepts: ["FailedEvapMonitorSmall", "FailedEvapMonitorLarge", "FailedEvapPurgeMonitor"],
  },
};
