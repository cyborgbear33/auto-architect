import type { CandidateAction } from "@auto/semantic-types";
import type { Cartridge, FramingResult, VehicleView } from "./types.ts";

/**
 * Engine-family-specific cartridge: FCA Tigershark 2.4L MultiAir2 (Jeep
 * Renegade/Compass, Fiat 500X, Ram ProMaster City). Only loaded when a
 * vehicle's `engineFamily` is `fca-tigershark-2.4` (see vehicle-profiles.json)
 * — a Silverado or any non-Tigershark vehicle never sees this cartridge.
 *
 * `MultiAirOilStarvation` itself lives in the shared TBox (dl-ontology.json)
 * behind the `fca-tigershark-2.4` view — per the lesson's rule, a cartridge
 * may reference classes but not define new ones.
 *
 * NOTE ON OIL PRESSURE: this cartridge keys perception off an
 * `OIL_PRESSURE_PSI` reading. Stock Mode 01 does not universally expose a raw
 * oil pressure PID on every ECU — some MY2015 Renegade PCMs expose it as an
 * enhanced PID via AlfaOBD, others don't at all (oil pressure is inferred from
 * a switch, not a transducer). If your build lacks a numeric PID, post a
 * manual `Observation` with `pid: "OIL_PRESSURE_PSI"` instead (obd-gateway
 * supports `--manual-pid` for exactly this case) — see apps/obd-gateway/README.md.
 */
const LOW_OIL_PRESSURE_PSI = 10;

function playbook(): CandidateAction[] {
  // Order mirrors TSB #05047457A's mandatory pre-check sequence — do not skip
  // ahead to the MultiAir actuator itself before ruling these out.
  return [
    {
      id: "check-oil-level",
      description:
        "check engine oil level on the dipstick — TSB 05047457A step 1: rule out low oil before anything else",
      impact: 0.4,
      confidence: 0.8,
      infoGain: 0.6,
      cost: 0.02,
      risk: 0.02,
      reversibility: 1,
      tags: ["measure", "tsb-05047457a"],
      firstStep: "this is the cheapest possible check — always do it first",
    },
    {
      id: "verify-oil-viscosity",
      description:
        "verify the installed oil matches OEM-specified viscosity/weight — TSB 05047457A step 2",
      impact: 0.3,
      confidence: 0.6,
      infoGain: 0.5,
      cost: 0.05,
      risk: 0.02,
      reversibility: 1,
      tags: ["measure", "tsb-05047457a"],
    },
    {
      id: "check-oil-filter-spec",
      description:
        "verify the oil filter meets OEM spec (some aftermarket filters restrict flow) — TSB 05047457A step 3",
      impact: 0.2,
      confidence: 0.5,
      infoGain: 0.4,
      cost: 0.05,
      risk: 0.02,
      reversibility: 1,
      tags: ["measure", "tsb-05047457a"],
    },
    {
      id: "inspect-oil-contamination",
      description:
        "inspect oil for dirty/deteriorated condition or contamination (coolant/fuel intrusion) — TSB 05047457A step 4-5",
      impact: 0.4,
      confidence: 0.5,
      infoGain: 0.6,
      cost: 0.1,
      risk: 0.02,
      reversibility: 1,
      tags: ["diagnostic", "tsb-05047457a"],
    },
    {
      id: "check-oil-galley-screen",
      description:
        "check the oil galley screen/filter feeding the MultiAir unit for a clog — TSB 05047457A step 6, the last oil-side check",
      impact: 0.5,
      confidence: 0.5,
      infoGain: 0.7,
      cost: 0.3,
      risk: 0.1,
      reversibility: 0.9,
      tags: ["diagnostic", "tsb-05047457a"],
    },
    {
      id: "inspect-multiair-actuator",
      description:
        "only after every oil-side cause above is ruled out: inspect/replace the MultiAir solenoid actuator itself",
      impact: 0.7,
      confidence: 0.4,
      infoGain: 0.5,
      cost: 0.6,
      risk: 0.15,
      reversibility: 0.7,
      tags: ["repair"],
      stopConditions: "do not do this before completing the TSB 05047457A oil-side checks above",
    },
  ];
}

function draft(vehicle: VehicleView): FramingResult {
  return {
    label: `${vehicle.label}: MultiAir fault under low oil pressure`,
    statement: {
      currentState:
        "a MultiAir-adjacent camshaft-timing DTC is active together with low oil pressure evidence",
      desiredState:
        "normal oil pressure, MultiAir fault DTC cleared, and confirmed root cause (oil-side vs. actuator)",
      gap: "TSB 05047457A's oil-side pre-checks have not yet been completed — do not condemn the MultiAir actuator first",
      whyItMatters:
        "this engine family has documented oil-consumption campaigns (W80/W84); low oil can both trigger this fault and, if ignored, risk a stall",
      urgency: "high",
    },
    gapType: "causal",
    desiredState: {
      successCriteria:
        "oil pressure reads normal, the MultiAir fault DTC does not return, and the TSB 05047457A oil-side pre-checks are documented as completed",
      measurement:
        "confirm oil level/viscosity/condition per TSB 05047457A, then rescan after the repair and a drive cycle",
    },
    actions: playbook(),
  };
}

export const fcaTigershark24Cartridge: Cartridge = {
  name: "fca-tigershark-2.4",
  perception: [
    {
      dtcConcept: "MultiAirFault",
      concept: "MultiAirFault",
      as: "symptom",
      slot: "multiair-fault",
    },
    {
      pid: "OIL_PRESSURE_PSI",
      when: { lt: LOW_OIL_PRESSURE_PSI },
      concept: "LowOilPressure",
      as: "condition",
      slot: "low-oil-pressure",
    },
  ],
  framing: [{ whenClass: "MultiAirOilStarvation", priority: 110, build: draft }],
  requires: {
    classes: ["MultiAirFault", "LowOilPressure", "MultiAirOilStarvation"],
    dtcConcepts: ["MultiAirFault"],
    pids: ["OIL_PRESSURE_PSI"],
  },
};
