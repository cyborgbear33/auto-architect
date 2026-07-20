import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic catalyst efficiency cartridge: P0420 / P0430.
 * DTC-only — do not gate on CATALYST_TEMP_* or Mode 06 until those meanings are ontologized (A3).
 */

function catalystPlaybook(bank: 1 | 2): CandidateAction[] {
  return [
    {
      id: `confirm-upstream-downstream-bank${bank}`,
      description: `compare upstream vs downstream O2 / AFR activity on bank ${bank} before replacing the converter`,
      impact: 0.55,
      confidence: 0.7,
      infoGain: 0.85,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep:
        "rule out exhaust leaks and rich/lean trim problems first — they commonly fake a catalyst code",
    },
    {
      id: `inspect-exhaust-leak-bank${bank}`,
      description: `inspect for exhaust leaks ahead of the bank ${bank} catalyst (false efficiency DTCs)`,
      impact: 0.45,
      confidence: 0.65,
      infoGain: 0.7,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
    },
  ];
}

function catalystDraft(bank: 1 | 2): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => ({
    label: `${vehicle.label}: catalyst efficiency bank ${bank}`,
    statement: {
      currentState: `a catalyst system efficiency below threshold DTC is active on bank ${bank}`,
      desiredState: "no catalyst efficiency DTC across a completed catalyst monitor",
      gap: "whether the converter itself is degraded vs upstream fueling/exhaust issues is not yet isolated",
      whyItMatters:
        "fails emissions testing; replacing the converter without root-cause checks is expensive",
      urgency: "low",
    },
    gapType: "causal",
    desiredState: {
      successCriteria:
        "no catalyst efficiency DTC after a full drive cycle with a completed catalyst monitor",
      measurement: "rescan after repair and confirm the catalyst monitor completes without return",
    },
    actions: catalystPlaybook(bank),
  });
}

export const catalystCartridge: Cartridge = {
  name: "catalyst",
  perception: [
    {
      dtcConcept: "CatalystCodeBank1",
      concept: "CatalystCodeBank1",
      as: "symptom",
      slot: "cat-bank1",
    },
    {
      dtcConcept: "CatalystCodeBank2",
      concept: "CatalystCodeBank2",
      as: "symptom",
      slot: "cat-bank2",
    },
  ],
  framing: [
    { whenClass: "CatalystEfficiencyBank1", priority: 45, build: catalystDraft(1) },
    { whenClass: "CatalystEfficiencyBank2", priority: 45, build: catalystDraft(2) },
  ],
  requires: {
    classes: [
      "CatalystCodeBank1",
      "CatalystCodeBank2",
      "CatalystEfficiencyBank1",
      "CatalystEfficiencyBank2",
    ],
    dtcConcepts: ["CatalystCodeBank1", "CatalystCodeBank2"],
  },
};
