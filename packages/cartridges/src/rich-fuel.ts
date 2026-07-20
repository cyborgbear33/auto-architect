import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/** SAE-generic rich-condition cartridge: P0172/P0175 + sustained negative long-term fuel trim. */
const NEGATIVE_TRIM_PCT = -10;

function richPlaybook(bank: 1 | 2): CandidateAction[] {
  return [
    {
      id: `check-fuel-pressure-bank${bank}`,
      description: `check fuel pressure and for a leaking injector on bank ${bank} (over-fueling)`,
      impact: 0.6,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.3,
      risk: 0.1,
      reversibility: 0.9,
      tags: ["diagnostic", "measure"],
    },
    {
      id: "inspect-maf-rich",
      description:
        "inspect the mass airflow sensor for contamination that can under-report airflow (rich trim)",
      impact: 0.35,
      confidence: 0.55,
      infoGain: 0.55,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
    },
    {
      id: `check-o2-upstream-bank${bank}`,
      description: `verify upstream O2 / AFR sensor response on bank ${bank} before condemning injectors`,
      impact: 0.45,
      confidence: 0.55,
      infoGain: 0.7,
      cost: 0.25,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function richDraft(bank: 1 | 2): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => ({
    label: `${vehicle.label}: rich condition bank ${bank}`,
    statement: {
      currentState: `bank ${bank} is running rich with sustained negative long-term fuel trim`,
      desiredState: `bank ${bank} fuel trim back within normal range and rich DTC cleared`,
      gap: "the source of the over-fueling or false-rich reading on this bank is not yet isolated",
      whyItMatters:
        "a persistent rich condition risks catalyst damage, fouled plugs, and poor fuel economy",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: `bank ${bank} long-term fuel trim returns to normal range and the rich DTC does not return after a drive cycle`,
      measurement:
        "monitor long-term fuel trim on the affected bank and rescan for the rich DTC after the repair",
    },
    actions: richPlaybook(bank),
  });
}

export const richFuelCartridge: Cartridge = {
  name: "rich-fuel",
  perception: [
    { dtcConcept: "RichCodeBank1", concept: "RichCodeBank1", as: "symptom", slot: "rich-bank1" },
    { dtcConcept: "RichCodeBank2", concept: "RichCodeBank2", as: "symptom", slot: "rich-bank2" },
    {
      pid: "LONG_FUEL_TRIM_1",
      when: { lt: NEGATIVE_TRIM_PCT },
      concept: "NegativeFuelTrim",
      as: "condition",
      slot: "negative-trim-1",
    },
    {
      pid: "LONG_FUEL_TRIM_2",
      when: { lt: NEGATIVE_TRIM_PCT },
      concept: "NegativeFuelTrim",
      as: "condition",
      slot: "negative-trim-2",
    },
  ],
  framing: [
    { whenClass: "RichFuelBank1", priority: 80, build: richDraft(1) },
    { whenClass: "RichFuelBank2", priority: 80, build: richDraft(2) },
  ],
  requires: {
    classes: [
      "RichCodeBank1",
      "RichCodeBank2",
      "NegativeFuelTrim",
      "FallingFuelTrim",
      "RichFuelBank1",
      "RichFuelBank2",
    ],
    dtcConcepts: ["RichCodeBank1", "RichCodeBank2"],
    pids: ["LONG_FUEL_TRIM_1", "LONG_FUEL_TRIM_2"],
  },
};
