import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * SAE-generic coolant thermostat + ECT circuit cartridge: P0125/P0126/P0128
 * and P0115–P0119. DTC-only — COOLANT_TEMP is evidence adjacency, not a
 * realize threshold.
 */

function thermostatPlaybook(): CandidateAction[] {
  return [
    {
      id: "verify-warm-up-temp",
      description:
        "after a cold start, watch COOLANT_TEMP climb toward thermostat regulating temp over a normal warm-up drive",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.05,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep:
        "confirm the gauge / PID rises steadily; a stuck-open thermostat often plateau below ~80–90 °C",
    },
    {
      id: "inspect-thermostat-housing",
      description:
        "inspect the thermostat / housing for a stuck-open thermostat, missing thermostat, or air in the cooling system",
      impact: 0.65,
      confidence: 0.7,
      infoGain: 0.7,
      cost: 0.35,
      risk: 0.1,
      reversibility: 0.5,
      tags: ["repair"],
    },
    {
      id: "cross-check-ect-plausibility",
      description:
        "cross-check ECT vs ambient / IAT after overnight soak before condemning the thermostat",
      impact: 0.45,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.1,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function ectCircuitPlaybook(): CandidateAction[] {
  return [
    {
      id: "check-ect-connector",
      description:
        "inspect the ECT sensor connector and wiring for open/short/chafing before replacing the thermostat",
      impact: 0.55,
      confidence: 0.75,
      infoGain: 0.85,
      cost: 0.15,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic", "measure"],
      firstStep: "wiggle-test the ECT connector while watching COOLANT_TEMP for dropouts",
    },
    {
      id: "measure-ect-sensor",
      description:
        "measure ECT sensor resistance / signal voltage against a known temperature chart",
      impact: 0.6,
      confidence: 0.7,
      infoGain: 0.8,
      cost: 0.2,
      risk: 0.05,
      reversibility: 1,
      tags: ["diagnostic"],
    },
  ];
}

function thermostatDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: coolant thermostat`,
    statement: {
      currentState: "a thermostat / insufficient-coolant-temperature DTC is active (e.g. P0128)",
      desiredState: "coolant reaches regulating temperature and no thermostat DTC returns",
      gap: "whether the thermostat is stuck open vs air in the system vs a lying ECT reading is not yet isolated",
      whyItMatters:
        "a stuck-open thermostat delays closed-loop, raises cold-run emissions, and hurts fuel economy / cabin heat",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no thermostat DTC after a warm-up drive that previously set the code",
      measurement:
        "confirm COOLANT_TEMP reaches normal operating range; rescan after cool-down cycle",
    },
    actions: thermostatPlaybook(),
  };
}

function ectCircuitDraft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: ECT sensor circuit`,
    statement: {
      currentState: "an engine coolant temperature sensor circuit DTC is active",
      desiredState: "no ECT circuit DTC after wiring/sensor repair",
      gap: "whether the fault is wiring vs the sensor itself is not yet isolated",
      whyItMatters:
        "a bad ECT signal corrupts fueling, fan control, and can falsely implicate the thermostat",
      urgency: "medium",
    },
    gapType: "causal",
    desiredState: {
      successCriteria: "no ECT circuit DTC after a drive cycle that previously set the code",
      measurement: "rescan; confirm COOLANT_TEMP tracks a known warm-up curve without dropouts",
    },
    actions: ectCircuitPlaybook(),
  };
}

export const coolantThermostatCartridge: Cartridge = {
  name: "coolant-thermostat",
  perception: [
    {
      dtcConcept: "ThermostatCode",
      concept: "ThermostatCode",
      as: "symptom",
      slot: "thermostat",
    },
    {
      dtcConcept: "EctCircuitCode",
      concept: "EctCircuitCode",
      as: "symptom",
      slot: "ect-circuit",
    },
  ],
  framing: [
    { whenClass: "CoolantThermostatFault", priority: 60, build: thermostatDraft },
    { whenClass: "EctSensorCircuitFault", priority: 55, build: ectCircuitDraft },
  ],
  requires: {
    classes: [
      "ThermostatCode",
      "EctCircuitCode",
      "CoolantThermostatFault",
      "EctSensorCircuitFault",
    ],
    dtcConcepts: ["ThermostatCode", "EctCircuitCode"],
    pids: ["COOLANT_TEMP"],
  },
};
