import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic O2 sensor cartridge — honest DTC-only subset:
 * circuit (P0130/P0150) and heater (P0135/P0155).
 * Voltage-range / slow-response codes wait until related PIDs are ontologized.
 */

function circuitPlaybook(bank: 1 | 2): CandidateAction[] {
  return [
    {
      id: `check-o2-wiring-bank${bank}`,
      description: `inspect upstream O2 sensor wiring and connector on bank ${bank} for open/short/chafing`,
      impact: 0.55,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
    },
    {
      id: `verify-o2-signal-bank${bank}`,
      description: `verify the bank ${bank} upstream O2 signal with a scope or live data before replacing the sensor`,
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

function heaterPlaybook(bank: 1 | 2): CandidateAction[] {
  return [
    {
      id: `check-o2-heater-power-bank${bank}`,
      description: `check heater power/ground and fuse for the bank ${bank} upstream O2 heater circuit`,
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "confirm heater supply voltage before condemning the sensor",
    },
    {
      id: `measure-o2-heater-resistance-bank${bank}`,
      description: `measure heater element resistance on the bank ${bank} upstream O2 sensor`,
      impact: 0.45,
      confidence: 0.7,
      infoGain: 0.7,
      cost: 0.1,
      risk: 0.05,
      reversibility: 1,
    },
  ];
}

function circuitDraft(bank: 1 | 2): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => ({
    label: `${vehicle.label}: O2 circuit bank ${bank} sensor 1`,
    statement: {
      currentState: `an O2 sensor circuit DTC is active for bank ${bank} sensor 1`,
      desiredState: "no O2 circuit DTC after wiring/sensor repair and a completed O2 monitor",
      gap: "whether the fault is wiring vs the sensor itself is not yet isolated",
      whyItMatters:
        "open/short O2 circuits force open-loop fueling and can set follow-on fuel trim codes",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no O2 circuit DTC across a drive cycle with a completed O2 monitor",
      measurement: "rescan after repair; confirm live O2 activity returns",
    },
    actions: circuitPlaybook(bank),
  });
}

function heaterDraft(bank: 1 | 2): (vehicle: VehicleView) => FramingResult {
  return (vehicle) => ({
    label: `${vehicle.label}: O2 heater bank ${bank} sensor 1`,
    statement: {
      currentState: `an O2 sensor heater circuit DTC is active for bank ${bank} sensor 1`,
      desiredState: "no O2 heater DTC after heater circuit/sensor repair",
      gap: "whether the heater element, fuse, or harness is at fault is not yet isolated",
      whyItMatters:
        "a failed heater delays closed-loop and can cause cold-start emissions / fuel trim issues",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no O2 heater DTC after a cold start and completed O2 heater monitor",
      measurement: "rescan after repair; confirm heater current/resistance in-spec",
    },
    actions: heaterPlaybook(bank),
  });
}

export const o2SensorCartridge: Cartridge = {
  name: "o2-sensor",
  perception: [
    {
      dtcConcept: "O2CircuitBank1",
      concept: "O2CircuitBank1",
      as: "symptom",
      slot: "o2-ckt-b1",
    },
    {
      dtcConcept: "O2CircuitBank2",
      concept: "O2CircuitBank2",
      as: "symptom",
      slot: "o2-ckt-b2",
    },
    {
      dtcConcept: "O2HeaterBank1",
      concept: "O2HeaterBank1",
      as: "symptom",
      slot: "o2-htr-b1",
    },
    {
      dtcConcept: "O2HeaterBank2",
      concept: "O2HeaterBank2",
      as: "symptom",
      slot: "o2-htr-b2",
    },
  ],
  framing: [
    { whenClass: "O2CircuitFaultBank1", priority: 55, build: circuitDraft(1) },
    { whenClass: "O2CircuitFaultBank2", priority: 55, build: circuitDraft(2) },
    { whenClass: "O2HeaterFaultBank1", priority: 50, build: heaterDraft(1) },
    { whenClass: "O2HeaterFaultBank2", priority: 50, build: heaterDraft(2) },
  ],
  requires: {
    classes: [
      "O2CircuitBank1",
      "O2CircuitBank2",
      "O2HeaterBank1",
      "O2HeaterBank2",
      "O2CircuitFaultBank1",
      "O2CircuitFaultBank2",
      "O2HeaterFaultBank1",
      "O2HeaterFaultBank2",
    ],
    dtcConcepts: ["O2CircuitBank1", "O2CircuitBank2", "O2HeaterBank1", "O2HeaterBank2"],
  },
};
