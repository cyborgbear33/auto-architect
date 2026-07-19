import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** SAE-generic lean-condition cartridge: P0171/P0174 + sustained positive long-term fuel trim. */
const POSITIVE_TRIM_PCT = 10;

function leanPlaybook(bank: 1 | 2): CandidateAction[] {
  return [
    {
      id: `smoke-test-intake-bank${bank}`,
      description: `smoke-test the intake tract on bank ${bank} for an unmetered air leak (cracked boot, loose clamp, bad gasket)`,
      impact: 0.6,
      confidence: 0.8,
      infoGain: 0.9,
      cost: 0.3,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "inspect-pcv-system",
      description: "inspect the PCV valve and hoses for a stuck-open or disconnected condition",
      impact: 0.4,
      confidence: 0.6,
      infoGain: 0.6,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
    },
    {
      id: "clean-check-maf",
      description: "clean/inspect the mass airflow sensor for contamination or a miscalibration",
      impact: 0.3,
      confidence: 0.5,
      infoGain: 0.5,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
    },
    {
      id: `inspect-injector-bank${bank}`,
      description: `check for a weak/clogged fuel injector on bank ${bank} (fuel-delivery-side lean cause)`,
      impact: 0.4,
      confidence: 0.5,
      infoGain: 0.5,
      cost: 0.25,
      risk: 0.1,
      reversibility: 0.9,
    },
  ];
}

function leanDraft(bank: 1 | 2): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => ({
    label: `${vehicle.label}: lean condition bank ${bank}`,
    statement: {
      currentState: `bank ${bank} is running lean with sustained positive long-term fuel trim`,
      desiredState: `bank ${bank} fuel trim back within normal range and lean DTC cleared`,
      gap: "the source of the unmetered air or fuel shortfall on this bank is not yet isolated",
      whyItMatters:
        "a persistent lean condition risks misfire, catalyst damage, and poor fuel economy",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: `bank ${bank} long-term fuel trim returns to normal range and the lean DTC does not return after a drive cycle`,
      measurement:
        "monitor long-term fuel trim on the affected bank and rescan for the lean DTC after the repair",
    },
    actions: leanPlaybook(bank),
  });
}

export const leanFuelCartridge: Cartridge = {
  name: "lean-fuel",
  perception: [
    { dtcConcept: "LeanCodeBank1", concept: "LeanCodeBank1", as: "symptom", slot: "lean-bank1" },
    { dtcConcept: "LeanCodeBank2", concept: "LeanCodeBank2", as: "symptom", slot: "lean-bank2" },
    {
      pid: "LONG_FUEL_TRIM_1",
      when: { gt: POSITIVE_TRIM_PCT },
      concept: "PositiveFuelTrim",
      as: "condition",
      slot: "positive-trim-1",
    },
    {
      pid: "LONG_FUEL_TRIM_2",
      when: { gt: POSITIVE_TRIM_PCT },
      concept: "PositiveFuelTrim",
      as: "condition",
      slot: "positive-trim-2",
    },
  ],
  framing: [
    { whenClass: "LeanFuelBank1", priority: 80, build: leanDraft(1) },
    { whenClass: "LeanFuelBank2", priority: 80, build: leanDraft(2) },
  ],
  requires: {
    classes: [
      "LeanCodeBank1",
      "LeanCodeBank2",
      "PositiveFuelTrim",
      "LeanFuelBank1",
      "LeanFuelBank2",
    ],
    dtcConcepts: ["LeanCodeBank1", "LeanCodeBank2"],
    pids: ["LONG_FUEL_TRIM_1", "LONG_FUEL_TRIM_2"],
  },
};
